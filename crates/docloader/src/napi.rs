//! ghita-docloader — NAPI bindings (feature "addon")
//! Exposes loadDocumentJs / detectMimeTypeJs to Node.js via napi-rs.
//! Uses dyn-symbols for Windows compatibility (no libnode.dll link requirement).

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::{detect_mime, extract_text, load_document};

/// Load a document from a file path (reads bytes, detects MIME, extracts text).
/// The `env` parameter is injected by napi and not exposed to JavaScript.
#[napi]
pub fn load_document_js(env: Env, path: String, data: Buffer) -> Result<Object> {
    let result = load_document(&path, data.as_ref());

    let mut obj = env.create_object()?;
    obj.set_named_property("content", env.create_string_from_std(result.content)?)?;
    obj.set_named_property("mimeType", env.create_string_from_std(result.mime_type)?)?;
    obj.set_named_property("sizeBytes", env.create_uint32(result.size_bytes as u32)?)?;
    obj.set_named_property(
        "source",
        env.create_string_from_std(result.source.to_string())?,
    )?;
    Ok(obj)
}

/// Detect MIME type from a file path string.
#[napi]
pub fn detect_mime_type_js(path: String) -> Result<String> {
    Ok(detect_mime(&path).to_string())
}

/// Extract text from raw bytes given a MIME type.
#[napi]
pub fn extract_text_js(data: Buffer, mime: String) -> Result<String> {
    Ok(extract_text(data.as_ref(), &mime))
}

/// Extract text from a PDF buffer natively (pdf-extract / lopdf parser).
/// Available when the addon is built — the `pdf` feature is part of `addon`.
#[napi]
pub fn extract_pdf_js(data: Buffer) -> Result<String> {
    #[cfg(feature = "pdf")]
    {
        crate::extract_pdf(data.as_ref()).map_err(napi::Error::from_reason)
    }
    #[cfg(not(feature = "pdf"))]
    {
        Err(napi::Error::from_reason(
            "docloader was built without the pdf feature",
        ))
    }
}

/// Extract text from a DOCX buffer natively (zip inflate + w:t parsing).
/// Available when the addon is built — the `docx` feature is part of `addon`.
#[napi]
pub fn extract_docx_js(data: Buffer) -> Result<String> {
    #[cfg(feature = "docx")]
    {
        crate::extract_docx(data.as_ref()).map_err(napi::Error::from_reason)
    }
    #[cfg(not(feature = "docx"))]
    {
        Err(napi::Error::from_reason(
            "docloader was built without the docx feature",
        ))
    }
}
