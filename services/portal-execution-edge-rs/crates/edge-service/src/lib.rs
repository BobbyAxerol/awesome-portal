//! Executable versioned read-side composition for a commissioned service owner.
//! Authority/proof ports MUST be supplied by their actual owners; this library
//! does not turn a delegated JWT or a configuration file into current rights.
#![forbid(unsafe_code)]

pub mod financial_projection;
pub mod projection_resources;
pub mod scoped_backend;
pub mod scoped_policy;
pub mod scoped_worker;
