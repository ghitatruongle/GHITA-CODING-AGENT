// ==============================================================================
// ghita-store — NAPI bindings (feature "addon")
// ==============================================================================
// Exposes KvStore operations to Node.js via napi-rs.
// ==============================================================================

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::KvStore;

#[napi]
pub struct NativeStore {
    inner: KvStore,
}

#[napi]
impl NativeStore {
    #[napi(constructor)]
    pub fn new(path: String) -> Result<Self> {
        let inner = KvStore::open(&path)
            .map_err(|e| Error::from_reason(format!("{}", e)))?;
        Ok(NativeStore { inner })
    }

    #[napi]
    pub fn get(&self, key: String) -> Result<Option<String>> {
        self.inner
            .get(&key)
            .map_err(|e| Error::from_reason(format!("{}", e)))
    }

    #[napi]
    pub fn set(&self, key: String, value: String) -> Result<()> {
        self.inner
            .set(&key, &value)
            .map_err(|e| Error::from_reason(format!("{}", e)))
    }

    #[napi]
    pub fn delete(&self, key: String) -> Result<bool> {
        self.inner
            .delete(&key)
            .map_err(|e| Error::from_reason(format!("{}", e)))
    }

    #[napi]
    pub fn keys(&self) -> Result<Vec<String>> {
        self.inner
            .keys()
            .map_err(|e| Error::from_reason(format!("{}", e)))
    }

    #[napi]
    pub fn count(&self) -> Result<u32> {
        self.inner
            .count()
            .map(|c| c as u32)
            .map_err(|e| Error::from_reason(format!("{}", e)))
    }
}

