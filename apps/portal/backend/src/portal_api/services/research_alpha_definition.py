"""Bounded, IO-free definition loader for purpose-separated imported alphas.

This is not a general Python plugin loader. Approved modules contain one
literal contract, plain functions and plain stateless helper classes whose
methods are static. Only named helpers and the existing numeric builtin set
may be called. No submitted module is imported, and loading never calls its
strategy bodies. The confined child still owns CPU/wall/memory limits.
"""

from __future__ import annotations

import ast
import builtins
from typing import Any, Callable


MAX_AST_NODES = 20_000
MAX_AST_DEPTH = 96
MAX_HELPER_CLASSES = 4
MAX_STATIC_METHODS = 20
MAX_MODULE_FUNCTIONS = 12
SAFE_BUILTINS = frozenset({
    "abs", "bool", "enumerate", "float", "int", "len", "max", "min",
    "range", "round", "sum", "zip",
})
_FORBIDDEN_NAMES = frozenset({
    "open", "eval", "exec", "compile", "globals", "locals", "getattr",
    "setattr", "delattr", "vars", "dir", "input", "breakpoint", "memoryview",
})
_FORBIDDEN_NODES = (
    ast.Import, ast.ImportFrom, ast.AsyncFunctionDef, ast.Lambda, ast.With,
    ast.AsyncWith, ast.Try, ast.Raise, ast.Global, ast.Nonlocal, ast.Yield,
    ast.YieldFrom, ast.Await, ast.While, ast.Delete, ast.NamedExpr, ast.Match,
    ast.AnnAssign,
)


def _fail(message: str) -> None:
    raise ValueError(f"Imported Alpha definition rejected: {message}")


def _docstring(node: ast.AST) -> bool:
    return isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)


def _safe_name(name: str) -> None:
    if name.startswith("__") or name in _FORBIDDEN_NAMES:
        _fail("forbidden name")


def _function_shape(function: ast.FunctionDef, *, static: bool) -> None:
    _safe_name(function.name)
    args = function.args
    if (
        args.defaults or args.kw_defaults or args.vararg or args.kwarg or args.kwonlyargs
        or function.returns is not None or getattr(function, "type_params", ())
        or any(arg.annotation is not None for arg in [*args.posonlyargs, *args.args])
    ):
        _fail("functions must have plain positional arguments, without defaults or annotations")
    decorators = function.decorator_list
    if static:
        if len(decorators) != 1 or not isinstance(decorators[0], ast.Name) or decorators[0].id != "staticmethod":
            _fail("helper class methods must declare exactly @staticmethod")
    elif decorators:
        _fail("module function decorators are not permitted")
    for node in ast.walk(function):
        if node is not function and isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            _fail("nested definitions are not permitted")


def validate_research_alpha_definition(
    source_text: str, *, expected_entrypoint: str,
) -> tuple[ast.Module, dict[str, Any]]:
    """Return an approved definition-only AST and its literal source contract.

    No body is evaluated here. All failures are bounded public-safe reasons;
    source text, paths and exception details are deliberately not returned.
    """
    if not isinstance(source_text, str) or not 1 <= len(source_text.encode("utf-8")) <= 256 * 1024:
        _fail("source size exceeds the single-file bound")
    if not isinstance(expected_entrypoint, str) or not expected_entrypoint.isidentifier():
        _fail("entrypoint must be one Python identifier")
    _safe_name(expected_entrypoint)
    try:
        tree = ast.parse(source_text, filename="<research-alpha-definition>", mode="exec")
    except (SyntaxError, ValueError, MemoryError, RecursionError):
        _fail("source syntax is invalid")
    stack: list[tuple[ast.AST, int]] = [(tree, 1)]
    count = 0
    while stack:
        node, depth = stack.pop()
        count += 1
        if count > MAX_AST_NODES or depth > MAX_AST_DEPTH:
            _fail("AST exceeds the bounded import contract")
        if isinstance(node, _FORBIDDEN_NODES):
            _fail(f"forbidden syntax {type(node).__name__}")
        if isinstance(node, ast.Name):
            _safe_name(node.id)
        stack.extend((child, depth + 1) for child in ast.iter_child_nodes(node))

    body = [node for node in tree.body if not _docstring(node)]
    assignments = [node for node in body if isinstance(node, ast.Assign)]
    if len(assignments) != 1:
        _fail("exactly one literal ALPHA_CONTRACT is required")
    assignment = assignments[0]
    if len(assignment.targets) != 1 or not isinstance(assignment.targets[0], ast.Name) or assignment.targets[0].id != "ALPHA_CONTRACT":
        _fail("only the literal ALPHA_CONTRACT may be assigned at module scope")
    try:
        contract = ast.literal_eval(assignment.value)
    except (ValueError, TypeError, MemoryError, RecursionError):
        _fail("ALPHA_CONTRACT must be a literal object")
    if not isinstance(contract, dict) or contract.get("schema_version") != "research.alpha-source.v1" or contract.get("entrypoint") != expected_entrypoint:
        _fail("literal contract and admitted entrypoint must match")
    functions = [node for node in body if isinstance(node, ast.FunctionDef)]
    classes = [node for node in body if isinstance(node, ast.ClassDef)]
    if len(body) != 1 + len(functions) + len(classes):
        _fail("module scope permits only literal contract and plain definitions")
    if not 1 <= len(functions) <= MAX_MODULE_FUNCTIONS or len(classes) > MAX_HELPER_CLASSES:
        _fail("definition count exceeds the bounded import contract")
    symbols: dict[str, ast.FunctionDef] = {}
    class_names: set[str] = set()
    for function in functions:
        _function_shape(function, static=False)
        if function.name in symbols or function.name in SAFE_BUILTINS or function.name in {"staticmethod", "ALPHA_CONTRACT"}:
            _fail("definition symbols may not collide or shadow the safe builtin set")
        symbols[function.name] = function
    entrypoint = symbols.get(expected_entrypoint)
    if entrypoint is None or len(entrypoint.args.posonlyargs) + len(entrypoint.args.args) != 1:
        _fail("admitted entrypoint must accept exactly one context")
    methods = 0
    for helper_class in classes:
        _safe_name(helper_class.name)
        if helper_class.bases or helper_class.keywords or helper_class.decorator_list or getattr(helper_class, "type_params", ()):
            _fail("helper classes may not inherit or declare metaclasses/decorators")
        if helper_class.name in class_names or helper_class.name in symbols or helper_class.name in SAFE_BUILTINS or helper_class.name in {"staticmethod", "ALPHA_CONTRACT"}:
            _fail("definition symbols may not collide or shadow the safe builtin set")
        class_names.add(helper_class.name)
        members = [node for node in helper_class.body if not _docstring(node)]
        if not members or any(not isinstance(node, ast.FunctionDef) for node in members):
            _fail("helper classes contain only docstrings and static methods, no class state")
        for method in members:
            _function_shape(method, static=True)
            key = f"{helper_class.name}.{method.name}"
            if key in symbols or method.name in SAFE_BUILTINS or method.name in {"staticmethod", "ALPHA_CONTRACT"}:
                _fail("method symbols may not collide or shadow the safe builtin set")
            symbols[key] = method
            methods += 1
    if methods > MAX_STATIC_METHODS:
        _fail("static method count exceeds the bounded import contract")

    protected = set(SAFE_BUILTINS) | set(symbols) | class_names | {"ALPHA_CONTRACT", "staticmethod"}
    allowed_attributes: set[int] = set()
    graph: dict[str, set[str]] = {name: set() for name in symbols}
    for symbol, function in symbols.items():
        for argument in [*function.args.posonlyargs, *function.args.args]:
            _safe_name(argument.arg)
            if argument.arg in protected:
                _fail("arguments may not shadow helper or builtin authority")
        for node in ast.walk(function):
            if isinstance(node, ast.Name) and node.id == "ALPHA_CONTRACT":
                _fail("strategy bodies may not read or mutate module contract state")
            if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)) and node.id in protected:
                _fail("local bindings may not shadow helper or builtin authority")
            if isinstance(node, ast.Call):
                if any(isinstance(arg, ast.Starred) for arg in node.args) or node.keywords:
                    _fail("calls must use explicit positional arguments")
                target: str | None = None
                if isinstance(node.func, ast.Name):
                    target = node.func.id
                    if target not in SAFE_BUILTINS and target not in symbols:
                        _fail("calls may target only named helpers or the bounded safe builtin set")
                elif isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                    target = f"{node.func.value.id}.{node.func.attr}"
                    if node.func.value.id not in class_names or target not in symbols:
                        _fail("attribute calls may target only declared static helper methods")
                    allowed_attributes.add(id(node.func))
                else:
                    _fail("dynamic call targets are not permitted")
                if target in graph:
                    graph[symbol].add(target)
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and id(node) not in allowed_attributes:
            _fail("instance attributes and reflection are not permitted")

    visited: set[str] = set()
    active: set[str] = set()

    def visit(symbol: str) -> None:
        if symbol in active:
            _fail("recursive or cyclic helper calls are not permitted")
        if symbol in visited:
            return
        active.add(symbol)
        for target in graph[symbol]:
            visit(target)
        active.remove(symbol)
        visited.add(symbol)

    for symbol in graph:
        visit(symbol)
    return ast.fix_missing_locations(ast.Module(body=body, type_ignores=[])), contract


def load_research_alpha_definition(
    source_text: str, *, expected_entrypoint: str,
) -> tuple[Callable[[dict[str, Any]], Any], dict[str, Any]]:
    """Load only the approved definitions; strategy execution belongs to child."""
    module, contract = validate_research_alpha_definition(source_text, expected_entrypoint=expected_entrypoint)
    safe_builtins = {name: getattr(builtins, name) for name in SAFE_BUILTINS}
    safe_builtins.update({"staticmethod": staticmethod, "__build_class__": builtins.__build_class__})
    namespace: dict[str, Any] = {"__builtins__": safe_builtins, "__name__": "research_alpha_definition"}
    exec(compile(module, "<research-alpha-definition>", "exec"), namespace, namespace)  # noqa: S102
    return namespace[expected_entrypoint], contract
