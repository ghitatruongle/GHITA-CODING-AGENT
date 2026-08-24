//! No custom build steps: with `dyn-symbols` the addon resolves Node API
//! symbols at runtime (GetProcAddress) — no libnode.dll needed at link time.
fn main() {}
