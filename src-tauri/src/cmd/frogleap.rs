use std::time::Duration;

use serde::Serialize;
use specta::Type;

use super::CmdResult;

const API_BASE: &str = "https://frogleap.click";

#[derive(Debug, Serialize, Type)]
pub struct FrogleapLoginLinkResult {
    pub throttled: bool,
}

#[derive(Debug, Serialize, Type)]
pub struct FrogleapConsumeResult {
    pub sub_url: std::string::String,
    pub email: std::string::String,
    pub status: std::string::String,
}

fn http_client() -> CmdResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| super::CommandFailure::coded("frogleap-client", e))
}

fn api_failure(
    operation: &str,
    status: reqwest::StatusCode,
    body: &str,
) -> super::CommandFailure {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .filter(|message| !message.is_empty())
        .unwrap_or_else(|| body.to_owned());
    super::CommandFailure::coded("frogleap-api", format!("{operation} failed ({status}): {detail}"))
}

/// Request a FrogLeap magic login link for the given email address.
#[tauri::command]
#[specta::specta]
pub async fn frogleap_send_login_link(
    contact: std::string::String,
    turnstile_token: Option<std::string::String>,
) -> CmdResult<FrogleapLoginLinkResult> {
    let client = http_client()?;
    let mut request = client
        .post(format!("{API_BASE}/api/tokens/login-link"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "contact": contact }));
    if let Some(token) = turnstile_token.filter(|token| !token.is_empty()) {
        request = request.header("x-turnstile-token", token);
    }

    let response = request
        .send()
        .await
        .map_err(|e| super::CommandFailure::coded("frogleap-network", e))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| super::CommandFailure::coded("frogleap-network", e))?;
    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| super::CommandFailure::coded("frogleap-payload", format!("{e}: {body}")))?;

    if !status.is_success() || parsed.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
        return Err(api_failure("login-link", status, &body));
    }

    let throttled = parsed
        .pointer("/data/throttled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    Ok(FrogleapLoginLinkResult { throttled })
}

/// Consume a magic-link ticket and return the account's subscription URL.
#[tauri::command]
#[specta::specta]
pub async fn frogleap_consume_ticket(
    ticket: std::string::String,
) -> CmdResult<FrogleapConsumeResult> {
    let client = http_client()?;
    let response = client
        .get(format!("{API_BASE}/api/tokens/magic/consume"))
        .query(&[("ticket", ticket)])
        .send()
        .await
        .map_err(|e| super::CommandFailure::coded("frogleap-network", e))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| super::CommandFailure::coded("frogleap-network", e))?;
    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| super::CommandFailure::coded("frogleap-payload", format!("{e}: {body}")))?;

    if !status.is_success() || parsed.get("ok").and_then(serde_json::Value::as_bool) != Some(true) {
        return Err(api_failure("magic consume", status, &body));
    }

    let data = parsed
        .pointer("/data")
        .ok_or_else(|| super::CommandFailure::coded("frogleap-payload", format!("missing data: {body}")))?;
    let take = |key: &str| {
        data.get(key)
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned)
    };
    let (sub_url, email, status) = (
        take("sub_url"),
        take("email"),
        take("status"),
    );
    match (sub_url, email, status) {
        (Some(sub_url), Some(email), Some(status)) => {
            Ok(FrogleapConsumeResult { sub_url, email, status })
        }
        _ => Err(super::CommandFailure::coded(
            "frogleap-payload",
            format!("incomplete consume payload: {body}"),
        )),
    }
}
