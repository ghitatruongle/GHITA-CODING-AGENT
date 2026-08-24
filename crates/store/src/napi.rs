//! ghita-store — NAPI bindings (feature "addon")
//! Exposes KvStore operations to Node.js via napi-rs.

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
        let inner = KvStore::open(&path).map_err(|e| Error::from_reason(format!("{}", e)))?;
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

    /// Set many pairs in one transaction (one commit for the whole batch).
    #[napi]
    pub fn set_many(&self, keys: Vec<String>, values: Vec<String>) -> Result<()> {
        if keys.len() != values.len() {
            return Err(Error::from_reason(
                "set_many requires keys.len() == values.len()".to_string(),
            ));
        }
        let entries: Vec<(&str, &str)> = keys
            .iter()
            .zip(values.iter())
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        self.inner
            .set_many(&entries)
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
