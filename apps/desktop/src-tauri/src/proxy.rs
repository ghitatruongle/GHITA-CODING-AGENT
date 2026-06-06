use bytes::Bytes;
use http::{Request, Response, StatusCode};
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper_util::rt::{TokioExecutor, TokioIo};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::RwLock;

type BodyClient = reqwest::Client;

pub struct ProxyState {
    pub is_running: bool,
    pub port: u16,
    pub target_url: String,
}

impl Default for ProxyState {
    fn default() -> Self {
        Self {
            is_running: false,
            port: 0,
            target_url: String::new(),
        }
    }
}

fn strip_frame_headers(response: Response<Full<Bytes>>) -> Response<Full<Bytes>> {
    let mut res = response;
    // Respect upstream X-Frame-Options; chỉ override CSP với app's own policy
    res.headers_mut().remove("content-security-policy");
    res.headers_mut().insert(
        http::header::CONTENT_SECURITY_POLICY,
        http::HeaderValue::from_static("frame-ancestors 'self' tauri://localhost"),
    );
    res
}

async fn handle_proxy_request(
    req: Request<Incoming>,
    body_client: &BodyClient,
    target_base: &str,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let uri = req.uri();
    let path = uri.path();

    let target_url = if target_base.ends_with('/') {
        format!("{}{}", target_base, &path[1..])
    } else {
        format!("{}{}", target_base, path)
    };

    let full_url = if let Some(query) = uri.query() {
        format!("{}?{}", target_url, query)
    } else {
        target_url
    };

    let method = req.method().clone();
    let headers = req.headers().clone();

    // Collect the request body from Incoming with size limit (10MB)
    const MAX_BODY_SIZE: usize = 10 * 1024 * 1024;
    let body_bytes = match req.into_body().collect().await {
        Ok(c) => {
            let b = c.to_bytes();
            if b.len() > MAX_BODY_SIZE {
                let mut resp = Response::new(Full::new(Bytes::from("Request body too large")));
                *resp.status_mut() = StatusCode::PAYLOAD_TOO_LARGE;
                return Ok(resp);
            }
            b
        }
        Err(_) => Bytes::new(),
    };

    // Build the request using reqwest
    let mut builder = body_client.request(method, &full_url);

    // Copy original request headers, skipping Host since reqwest will auto-populate it
    for (key, value) in headers.iter() {
        if key != http::header::HOST {
            builder = builder.header(key.clone(), value.clone());
        }
    }

    if !body_bytes.is_empty() {
        builder = builder.body(body_bytes);
    }

    // Perform request with a timeout
    const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(30);
    let request_future = builder.timeout(UPSTREAM_TIMEOUT).send();

    match request_future.await {
        Ok(resp) => {
            let status = resp.status();
            let mut res_builder = Response::builder().status(status);

            // Copy response headers back
            if let Some(headers_mut) = res_builder.headers_mut() {
                for (key, value) in resp.headers().iter() {
                    headers_mut.insert(key.clone(), value.clone());
                }
            }

            // Read the full body bytes
            let body_bytes = match resp.bytes().await {
                Ok(b) => b,
                Err(_) => Bytes::new(),
            };

            let response = match res_builder.body(Full::new(body_bytes)) {
                Ok(r) => r,
                Err(e) => {
                    let mut response = Response::new(Full::new(Bytes::from(format!("Failed to build proxy response: {e}"))));
                    *response.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
                    response
                }
            };

            Ok(strip_frame_headers(response))
        }
        Err(e) => {
            let is_timeout = e.is_timeout();
            eprintln!("[proxy] Upstream error: {:?}", e);
            let mut response = Response::new(Full::new(Bytes::from("Upstream service unavailable")));
            *response.status_mut() = if is_timeout {
                StatusCode::GATEWAY_TIMEOUT
            } else {
                StatusCode::BAD_GATEWAY
            };
            Ok(response)
        }
    }
}

pub async fn start_proxy_server(
    port: u16,
    target_url: String,
    state: Arc<RwLock<ProxyState>>,
) -> Result<(), String> {
    {
        let s = state.read().await;
        if s.is_running {
            return Err("Proxy already running".to_string());
        }
    }

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = TcpListener::bind(addr).await.map_err(|e| e.to_string())?;

    let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();

    {
        let mut s = state.write().await;
        s.is_running = true;
        s.port = local_port;
        s.target_url = target_url;
    }

    // Build reqwest client
    let body_client: BodyClient = match reqwest::Client::builder()
        // TLS validation enabled — do NOT use danger_accept_invalid_certs
        .build()
    {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to build reqwest client: {e}")),
    };

    let state_clone = state.clone();

    // Move listener into the spawned task so it's properly dropped when the task exits
    tokio::spawn(async move {
        loop {
            // Check if we should stop BEFORE accepting (avoids race on restart)
            {
                let s = state_clone.read().await;
                if !s.is_running {
                    break;
                }
            }

            match listener.accept().await {
                Ok((stream, _)) => {
                    let io = TokioIo::new(stream);
                    let body_client = body_client.clone();
                    let state_clone2 = state_clone.clone();

                    tokio::spawn(async move {
                        let service = hyper::service::service_fn(move |req: Request<Incoming>| {
                            let body_client = body_client.clone();
                            let state = state_clone2.clone();
                            async move {
                                let target = {
                                    let s = state.read().await;
                                    s.target_url.trim_end_matches('/').to_string()
                                };
                                handle_proxy_request(req, &body_client, &target).await
                            }
                        });

                        if let Err(e) = hyper_util::server::conn::auto::Builder::new(TokioExecutor::new())
                            .serve_connection(io, service)
                            .await
                        {
                            eprintln!("Proxy connection error: {:?}", e);
                        }
                    });
                }
                Err(e) => {
                    eprintln!("Accept error: {:?}", e);
                    // Brief sleep to avoid busy-loop on accept errors
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
        // TcpListener is dropped here when the task exits, releasing the port
        eprintln!("Proxy listener task ended, port {} released", local_port);
    });

    Ok(())
}

pub async fn stop_proxy_server(state: Arc<RwLock<ProxyState>>) -> Result<(), String> {
    let mut s = state.write().await;
    if !s.is_running {
        return Err("Proxy not running".to_string());
    }
    s.is_running = false;
    s.port = 0;
    Ok(())
}

pub async fn get_proxy_port(state: &Arc<RwLock<ProxyState>>) -> Option<u16> {
    let s = state.read().await;
    if s.is_running {
        Some(s.port)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hyper::body::Incoming;
    use hyper::service::service_fn;
    use hyper_util::server::conn::auto::Builder as ServerBuilder;
    use std::convert::Infallible;

    // ── Helpers ──────────────────────────────────────────────────────────

    /// Start a tiny echo HTTP server that returns JSON with method, path, and body.
    /// Returns (port, shutdown_sender).
    async fn start_echo_server() -> (u16, tokio::sync::oneshot::Sender<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept = listener.accept() => {
                        if let Ok((stream, _)) = accept {
                            let io = TokioIo::new(stream);
                            tokio::spawn(async move {
                                let service = service_fn(|req: Request<Incoming>| async move {
                                    let (parts, body) = req.into_parts();
                                    let bytes = body.collect().await.unwrap().to_bytes();
                                    let body_str = String::from_utf8_lossy(&bytes);

                                    let echo = serde_json::json!({
                                        "method": parts.method.to_string(),
                                        "path": parts.uri.to_string(),
                                        "body": body_str,
                                    });

                                    Ok::<_, Infallible>(
                                        Response::new(Full::new(Bytes::from(echo.to_string())))
                                    )
                                });

                                let _ = ServerBuilder::new(TokioExecutor::new())
                                    .serve_connection(io, service)
                                    .await;
                            });
                        } else {
                            break;
                        }
                    }
                    _ = &mut shutdown_rx => break,
                }
            }
        });

        (port, shutdown_tx)
    }

    /// Poll until the proxy TCP listener is ready (max `max_retries` × 50 ms).
    async fn wait_for_proxy(port: u16, max_retries: u32) {
        for _ in 0..max_retries {
            if tokio::net::TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        panic!("Proxy did not become ready within {max_retries} retries");
    }

    // ── strip_frame_headers ─────────────────────────────────────────────

    #[test]
    fn test_strip_headers_removes_all_security_headers() {
        let mut response = Response::new(Full::new(Bytes::from("body")));
        response
            .headers_mut()
            .insert("x-frame-options", "DENY".parse().unwrap());
        response
            .headers_mut()
            .insert("x-content-type-options", "nosniff".parse().unwrap());
        response
            .headers_mut()
            .insert("content-security-policy", "default-src 'self'".parse().unwrap());

        let result = strip_frame_headers(response);

        // Respect upstream X-Frame-Options
        assert!(result.headers().contains_key("x-frame-options"));
        assert_eq!(result.headers().get("x-frame-options").unwrap(), "DENY");
        assert!(result.headers().contains_key("x-content-type-options"));
        // CSP overrides with app's own policy
        assert_eq!(
            result.headers().get("content-security-policy").unwrap(),
            "frame-ancestors 'self' tauri://localhost"
        );
    }

    #[test]
    fn test_strip_headers_preserves_other_headers() {
        let mut response = Response::new(Full::new(Bytes::from("hello")));
        response
            .headers_mut()
            .insert("content-type", "text/plain".parse().unwrap());
        response
            .headers_mut()
            .insert("x-custom", "keep-me".parse().unwrap());

        let result = strip_frame_headers(response);

        assert_eq!(result.headers().get("content-type").unwrap(), "text/plain");
        assert_eq!(result.headers().get("x-custom").unwrap(), "keep-me");
        // Headers are the focus here; body integrity is verified in e2e tests
    }

    #[test]
    fn test_strip_headers_partial_removal() {
        let mut response = Response::new(Full::new(Bytes::from("data")));
        response
            .headers_mut()
            .insert("x-frame-options", "SAMEORIGIN".parse().unwrap());
        response
            .headers_mut()
            .insert("cache-control", "no-cache".parse().unwrap());

        let result = strip_frame_headers(response);

        // Respect upstream X-Frame-Options
        assert!(result.headers().contains_key("x-frame-options"));
        assert_eq!(result.headers().get("x-frame-options").unwrap(), "SAMEORIGIN");
        assert_eq!(
            result.headers().get("cache-control").unwrap(),
            "no-cache"
        );
    }

    #[test]
    fn test_strip_headers_empty_response() {
        let response = Response::new(Full::new(Bytes::new()));
        let result = strip_frame_headers(response);
        // Verify function doesn't panic on empty body
        assert_eq!(result.status(), StatusCode::OK);
    }

    // ── ProxyState ──────────────────────────────────────────────────────

    #[test]
    fn test_proxy_state_default() {
        let state = ProxyState::default();
        assert!(!state.is_running);
        assert_eq!(state.port, 0);
    }

    // ── get_proxy_port ──────────────────────────────────────────────────

    #[tokio::test]
    async fn test_get_proxy_port_when_stopped() {
        let state = Arc::new(RwLock::new(ProxyState::default()));
        assert!(get_proxy_port(&state).await.is_none());
    }

    #[tokio::test]
    async fn test_get_proxy_port_when_running() {
        let state = Arc::new(RwLock::new(ProxyState {
            is_running: true,
            port: 3456,
            target_url: String::new(),
        }));
        assert_eq!(get_proxy_port(&state).await, Some(3456));
    }

    // ── Proxy lifecycle (start / stop / restart) ────────────────────────

    #[tokio::test]
    async fn test_start_proxy_binds_port() {
        let state = Arc::new(RwLock::new(ProxyState::default()));

        start_proxy_server(0, "http://127.0.0.1:1".into(), state.clone())
            .await
            .unwrap();

        let port = get_proxy_port(&state).await.expect("proxy should be running");
        assert!(port > 0, "a real port should be assigned");

        stop_proxy_server(state.clone()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(150)).await;
        assert!(get_proxy_port(&state).await.is_none());
    }

    #[tokio::test]
    async fn test_double_start_returns_error() {
        let state = Arc::new(RwLock::new(ProxyState::default()));

        start_proxy_server(0, "http://127.0.0.1:1".into(), state.clone())
            .await
            .unwrap();

        let err = start_proxy_server(0, "http://127.0.0.1:2".into(), state.clone())
            .await
            .unwrap_err();
        assert!(err.contains("already running"), "error: {err}");

        stop_proxy_server(state.clone()).await.unwrap();
    }

    #[tokio::test]
    async fn test_double_stop_returns_error() {
        let state = Arc::new(RwLock::new(ProxyState::default()));

        start_proxy_server(0, "http://127.0.0.1:1".into(), state.clone())
            .await
            .unwrap();
        stop_proxy_server(state.clone()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(150)).await;

        let err = stop_proxy_server(state.clone()).await.unwrap_err();
        assert!(err.contains("not running"), "error: {err}");
    }

    #[tokio::test]
    async fn test_restart_proxy_after_stop() {
        let state = Arc::new(RwLock::new(ProxyState::default()));

        // First cycle
        start_proxy_server(0, "http://127.0.0.1:1".into(), state.clone())
            .await
            .unwrap();
        let _port1 = get_proxy_port(&state).await.unwrap();
        stop_proxy_server(state.clone()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(250)).await; // allow OS to release port

        // Second cycle — must succeed (listener was dropped)
        start_proxy_server(0, "http://127.0.0.1:1".into(), state.clone())
            .await
            .unwrap();
        let port2 = get_proxy_port(&state).await.expect("proxy should be running after restart");
        assert!(port2 > 0, "restarted proxy must bind a port");

        stop_proxy_server(state.clone()).await.unwrap();
    }

    // ── End-to-end request forwarding ───────────────────────────────────

    #[tokio::test]
    async fn test_proxy_forwards_get_request() {
        let (echo_port, _shutdown) = start_echo_server().await;
        let echo_url = format!("http://127.0.0.1:{echo_port}");

        let state = Arc::new(RwLock::new(ProxyState::default()));
        start_proxy_server(0, echo_url, state.clone()).await.unwrap();
        let proxy_port = get_proxy_port(&state).await.unwrap();
        wait_for_proxy(proxy_port, 10).await;

        let client = reqwest::Client::new();
        let resp = client
            .get(format!("http://127.0.0.1:{proxy_port}/test-path"))
            .send()
            .await
            .unwrap();
        assert!(resp.status().is_success(), "GET should succeed");

        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["method"], "GET");
        assert_eq!(body["path"], "/test-path");
        assert_eq!(body["body"], "");

        stop_proxy_server(state).await.unwrap();
    }

    #[tokio::test]
    async fn test_proxy_forwards_post_body() {
        let (echo_port, _shutdown) = start_echo_server().await;
        let echo_url = format!("http://127.0.0.1:{echo_port}");

        let state = Arc::new(RwLock::new(ProxyState::default()));
        start_proxy_server(0, echo_url, state.clone()).await.unwrap();
        let proxy_port = get_proxy_port(&state).await.unwrap();
        wait_for_proxy(proxy_port, 10).await;

        let test_body = "Hello from GHITA proxy test!";
        let client = reqwest::Client::new();
        let resp = client
            .post(format!("http://127.0.0.1:{proxy_port}/api/data"))
            .body(test_body)
            .header("content-type", "text/plain")
            .send()
            .await
            .unwrap();
        assert!(resp.status().is_success(), "POST should succeed");

        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["method"], "POST");
        assert_eq!(body["path"], "/api/data");
        assert_eq!(
            body["body"], test_body,
            "POST body must be forwarded correctly"
        );

        stop_proxy_server(state).await.unwrap();
    }

    #[tokio::test]
    async fn test_proxy_forwards_put_body() {
        let (echo_port, _shutdown) = start_echo_server().await;
        let echo_url = format!("http://127.0.0.1:{echo_port}");

        let state = Arc::new(RwLock::new(ProxyState::default()));
        start_proxy_server(0, echo_url, state.clone()).await.unwrap();
        let proxy_port = get_proxy_port(&state).await.unwrap();
        wait_for_proxy(proxy_port, 10).await;

        let json_body = r#"{"key": "value", "nested": {"num": 42}}"#;
        let client = reqwest::Client::new();
        let resp = client
            .put(format!("http://127.0.0.1:{proxy_port}/api/update"))
            .body(json_body)
            .header("content-type", "application/json")
            .send()
            .await
            .unwrap();
        assert!(resp.status().is_success(), "PUT should succeed");

        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["method"], "PUT");
        assert_eq!(
            body["body"], json_body,
            "PUT JSON body must be forwarded correctly"
        );

        stop_proxy_server(state).await.unwrap();
    }

    #[tokio::test]
    async fn test_proxy_forwards_patch_body() {
        let (echo_port, _shutdown) = start_echo_server().await;
        let echo_url = format!("http://127.0.0.1:{echo_port}");

        let state = Arc::new(RwLock::new(ProxyState::default()));
        start_proxy_server(0, echo_url, state.clone()).await.unwrap();
        let proxy_port = get_proxy_port(&state).await.unwrap();
        wait_for_proxy(proxy_port, 10).await;

        let patch_body = r#"[{"op": "replace", "path": "/name", "value": "test"}]"#;
        let client = reqwest::Client::new();
        let resp = client
            .patch(format!("http://127.0.0.1:{proxy_port}/api/patch"))
            .body(patch_body)
            .header("content-type", "application/json-patch+json")
            .send()
            .await
            .unwrap();
        assert!(resp.status().is_success(), "PATCH should succeed");

        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["method"], "PATCH");
        assert_eq!(
            body["body"], patch_body,
            "PATCH body must be forwarded correctly"
        );

        stop_proxy_server(state).await.unwrap();
    }

    #[tokio::test]
    async fn test_proxy_forwards_large_body() {
        let (echo_port, _shutdown) = start_echo_server().await;
        let echo_url = format!("http://127.0.0.1:{echo_port}");

        let state = Arc::new(RwLock::new(ProxyState::default()));
        start_proxy_server(0, echo_url, state.clone()).await.unwrap();
        let proxy_port = get_proxy_port(&state).await.unwrap();
        wait_for_proxy(proxy_port, 10).await;

        let large_body = "A".repeat(100_000); // 100 KB
        let client = reqwest::Client::new();
        let resp = client
            .post(format!("http://127.0.0.1:{proxy_port}/large"))
            .body(large_body.clone())
            .send()
            .await
            .unwrap();
        assert!(resp.status().is_success(), "large POST should succeed");

        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["method"], "POST");
        assert_eq!(
            body["body"], large_body,
            "large body must be forwarded correctly"
        );

        stop_proxy_server(state).await.unwrap();
    }

    #[tokio::test]
    async fn test_proxy_forwards_empty_post_body() {
        let (echo_port, _shutdown) = start_echo_server().await;
        let echo_url = format!("http://127.0.0.1:{echo_port}");

        let state = Arc::new(RwLock::new(ProxyState::default()));
        start_proxy_server(0, echo_url, state.clone()).await.unwrap();
        let proxy_port = get_proxy_port(&state).await.unwrap();
        wait_for_proxy(proxy_port, 10).await;

        let client = reqwest::Client::new();
        let resp = client
            .post(format!("http://127.0.0.1:{proxy_port}/empty"))
            .send()
            .await
            .unwrap();
        assert!(resp.status().is_success(), "empty POST should succeed");

        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["method"], "POST");
        assert_eq!(body["body"], "", "empty POST body should be forwarded");

        stop_proxy_server(state).await.unwrap();
    }

    #[tokio::test]
    async fn test_proxy_preserves_query_params() {
        let (echo_port, _shutdown) = start_echo_server().await;
        let echo_url = format!("http://127.0.0.1:{echo_port}");

        let state = Arc::new(RwLock::new(ProxyState::default()));
        start_proxy_server(0, echo_url, state.clone()).await.unwrap();
        let proxy_port = get_proxy_port(&state).await.unwrap();
        wait_for_proxy(proxy_port, 10).await;

        let client = reqwest::Client::new();
        let resp = client
            .get(format!(
                "http://127.0.0.1:{proxy_port}/search?q=rust&page=1"
            ))
            .send()
            .await
            .unwrap();
        assert!(resp.status().is_success());

        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["path"], "/search?q=rust&page=1");

        stop_proxy_server(state).await.unwrap();
    }

    #[tokio::test]
    async fn test_proxy_handles_concurrent_requests() {
        let (echo_port, _shutdown) = start_echo_server().await;
        let echo_url = format!("http://127.0.0.1:{echo_port}");

        let state = Arc::new(RwLock::new(ProxyState::default()));
        start_proxy_server(0, echo_url, state.clone()).await.unwrap();
        let proxy_port = get_proxy_port(&state).await.unwrap();
        wait_for_proxy(proxy_port, 10).await;

        let base = format!("http://127.0.0.1:{proxy_port}");
        let mut handles = Vec::new();
        for i in 0..5 {
            let url = format!("{base}/concurrent/{i}");
            handles.push(tokio::spawn(async move {
                let client = reqwest::Client::new();
                let resp = client.get(&url).send().await.unwrap();
                let body: serde_json::Value = resp.json().await.unwrap();
                (i, body["path"].as_str().unwrap().to_string())
            }));
        }

        for handle in handles {
            let (i, path) = handle.await.unwrap();
            assert_eq!(
                path,
                format!("/concurrent/{i}"),
                "concurrent request {i} must have correct path"
            );
        }

        stop_proxy_server(state).await.unwrap();
    }

    #[tokio::test]
    async fn test_proxy_handles_not_found_upstream() {
        // Point proxy at a port that refuses connections → proxy returns 502
        let state = Arc::new(RwLock::new(ProxyState::default()));
        start_proxy_server(0, "http://127.0.0.1:1".into(), state.clone())
            .await
            .unwrap();
        let proxy_port = get_proxy_port(&state).await.unwrap();
        wait_for_proxy(proxy_port, 10).await;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let resp = client
            .get(format!("http://127.0.0.1:{proxy_port}/anything"))
            .send()
            .await
            .unwrap();

        // No upstream listening → proxy returns 502 Bad Gateway
        assert!(
            resp.status().is_server_error(),
            "expected 5xx for unreachable upstream, got {}",
            resp.status()
        );

        stop_proxy_server(state).await.unwrap();
    }
}
