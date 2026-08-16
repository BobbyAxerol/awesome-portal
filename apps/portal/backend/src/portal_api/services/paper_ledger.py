"""Paper trading ledger and reconciliation foundations (U15 / BAR-12-BE2).

Append-only deterministic paper account state (cash, positions, orders,
fills) with secret REFERENCES only — no live credential ever reaches the
browser/worker. Reconciliation compares ledger fills against the venue feed
with drift detection; the venue adapter is a stub for the slice.
"""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from portal_api.domain.errors import PortalDomainError
from portal_api.serialization import canonicalize


class PaperLedgerError(PortalDomainError):
    code = "PAPER_LEDGER_DENIED"


@dataclass(frozen=True, slots=True)
class PaperOrder:
    order_id: str
    account_id: str
    symbol: str
    side: str
    quantity: float
    price: float
    created_at: str


@dataclass(frozen=True, slots=True)
class PaperFill:
    fill_id: str
    order_id: str
    symbol: str
    side: str
    quantity: float
    price: float
    occurred_at: str


class PaperLedger:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def account_path(self, account_id: str) -> Path:
        return self.root / "accounts" / f"{account_id}.json"

    def create_account(
        self,
        *,
        initial_cash: float,
        secret_reference: str,
    ) -> dict[str, Any]:
        account_id = f"pac_{secrets.token_hex(10)}"
        account = {
            "account_id": account_id,
            "initial_cash": initial_cash,
            "cash": initial_cash,
            "secret_reference": secret_reference,  # reference only, never a key
            "positions": {},
            "orders": [],
            "fills": [],
            "created_at": datetime.now(UTC).isoformat(),
        }
        self._write(account_id, account)
        return account

    def submit_order(
        self,
        account_id: str,
        *,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
    ) -> tuple[PaperOrder, PaperFill]:
        account = self._read(account_id)
        if side not in {"buy", "sell"}:
            raise PaperLedgerError("side must be buy or sell")
        if quantity <= 0 or price <= 0:
            raise PaperLedgerError("quantity and price must be positive")
        if side == "buy" and quantity * price > account["cash"]:
            raise PaperLedgerError("insufficient paper cash")
        order = PaperOrder(
            order_id=f"ord_{secrets.token_hex(8)}",
            account_id=account_id,
            symbol=symbol,
            side=side,
            quantity=quantity,
            price=price,
            created_at=datetime.now(UTC).isoformat(),
        )
        fill = PaperFill(
            fill_id=f"fil_{secrets.token_hex(8)}",
            order_id=order.order_id,
            symbol=symbol,
            side=side,
            quantity=quantity,
            price=price,
            occurred_at=datetime.now(UTC).isoformat(),
        )
        cost = quantity * price
        account["cash"] = round(
            account["cash"] + (cost if side == "sell" else -cost), 6
        )
        position = account["positions"].get(symbol, 0.0)
        account["positions"][symbol] = round(
            position + (quantity if side == "buy" else -quantity), 6
        )
        account["orders"].append({**asdict(order), "fill_id": fill.fill_id})
        account["fills"].append(asdict(fill))
        self._write(account_id, account)
        return order, fill

    def state(self, account_id: str) -> dict[str, Any]:
        account = self._read(account_id)
        return {
            "account_id": account["account_id"],
            "cash": account["cash"],
            "positions": account["positions"],
            "secret_reference": account["secret_reference"],
            "order_count": len(account["orders"]),
            "fill_count": len(account["fills"]),
        }

    def replay(self, account_id: str) -> dict[str, Any]:
        """Deterministic ledger replay: recompute state from the fill list."""
        account = self._read(account_id)
        cash = account["initial_cash"]
        positions: dict[str, float] = {}
        for fill in account["fills"]:
            cost = fill["quantity"] * fill["price"]
            cash += cost if fill["side"] == "sell" else -cost
            positions[fill["symbol"]] = positions.get(fill["symbol"], 0.0) + (
                fill["quantity"] if fill["side"] == "buy" else -fill["quantity"]
            )
        cash = round(cash, 6)
        positions = {symbol: round(value, 6) for symbol, value in positions.items()}
        return {
            "account_id": account_id,
            "cash": cash,
            "positions": positions,
            "matches": cash == account["cash"] and positions == account["positions"],
        }

    def reconcile(
        self,
        account_id: str,
        venue_fills: list[PaperFill],
    ) -> dict[str, Any]:
        """Compare ledger fills with the venue feed; drift fails the gate."""
        account = self._read(account_id)
        ledger_fills = [PaperFill(**fill) for fill in account["fills"]]
        matched = 0
        drift = 0
        venue_by_order = {fill.order_id: fill for fill in venue_fills}
        for ledger_fill in ledger_fills:
            venue = venue_by_order.get(ledger_fill.order_id)
            if venue is None or venue.price != ledger_fill.price:
                drift += 1
            else:
                matched += 1
        clean = drift == 0 and matched == len(ledger_fills)
        return {
            "account_id": account_id,
            "ledger_fills": len(ledger_fills),
            "venue_fills": len(venue_fills),
            "matched": matched,
            "drift": drift,
            "clean": clean,
        }

    def _read(self, account_id: str) -> dict[str, Any]:
        path = self.account_path(account_id)
        if not path.is_file():
            raise PaperLedgerError("account not found")
        return json.loads(path.read_text(encoding="utf-8"))

    def _write(self, account_id: str, account: dict[str, Any]) -> None:
        path = self.account_path(account_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(".tmp")
        temp.write_text(
            json.dumps(canonicalize(account), sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temp, path)


__all__ = ["PaperFill", "PaperLedger", "PaperLedgerError", "PaperOrder"]
