//! Minimal Solana JSON-RPC over HTTPS (rustls) — avoids `solana-client` → OpenSSL on Windows.

use anyhow::{anyhow, Context};
use base64::Engine;
use bincode::Options;
use serde_json::{json, Value};
use solana_account::Account;
use solana_clock::Epoch;
use solana_commitment_config::CommitmentConfig;
use solana_hash::Hash;
use solana_pubkey::Pubkey;
use solana_signature::Signature;
use solana_transaction::Transaction;
use std::str::FromStr;

pub struct RpcLight {
    url: String,
    http: reqwest::blocking::Client,
    commitment: CommitmentConfig,
}

impl RpcLight {
    pub fn new(url: impl Into<String>, commitment: CommitmentConfig) -> Self {
        Self {
            url: url.into(),
            http: reqwest::blocking::Client::builder()
                .use_rustls_tls()
                .build()
                .expect("reqwest client"),
            commitment,
        }
    }

    fn post(&self, method: &str, params: Value) -> anyhow::Result<Value> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1u64,
            "method": method,
            "params": params,
        });
        let resp = self
            .http
            .post(&self.url)
            .json(&body)
            .send()
            .with_context(|| format!("RPC POST {method}"))?;
        let v: Value = resp.json().with_context(|| format!("RPC json {method}"))?;
        if let Some(err) = v.get("error") {
            return Err(anyhow!("RPC error {}: {}", method, err));
        }
        v.get("result")
            .cloned()
            .ok_or_else(|| anyhow!("RPC missing result for {method}"))
    }

    pub fn get_account(&self, pubkey: &Pubkey) -> anyhow::Result<Option<Account>> {
        let r = self.post(
            "getAccountInfo",
            json!([pubkey.to_string(), { "encoding": "base64" }]),
        )?;
        let val = match r.get("value") {
            None | Some(Value::Null) => return Ok(None),
            Some(v) => v,
        };
        let data_b64 = val
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|a| a.get(0))
            .and_then(|x| x.as_str())
            .ok_or_else(|| anyhow!("getAccountInfo: missing data"))?;
        let raw = base64::engine::general_purpose::STANDARD
            .decode(data_b64)
            .context("base64 account data")?;
        let owner = Pubkey::from_str(
            val
                .get("owner")
                .and_then(|o| o.as_str())
                .ok_or_else(|| anyhow!("owner"))?,
        )?;
        let lamports = val
            .get("lamports")
            .and_then(|x| x.as_u64())
            .ok_or_else(|| anyhow!("lamports"))?;
        let executable = val
            .get("executable")
            .and_then(|x| x.as_bool())
            .unwrap_or(false);
        let rent_epoch = parse_rent_epoch(val.get("rentEpoch"))?;
        Ok(Some(Account {
            lamports,
            data: raw,
            owner,
            executable,
            rent_epoch,
        }))
    }

    pub fn get_latest_blockhash(&self) -> anyhow::Result<Hash> {
        let r = self.post(
            "getLatestBlockhash",
            json!([{ "commitment": self.commitment.commitment.to_string() }]),
        )?;
        let bh = r
            .get("value")
            .and_then(|v| v.get("blockhash"))
            .and_then(|h| h.as_str())
            .ok_or_else(|| anyhow!("blockhash"))?;
        Hash::from_str(bh).map_err(Into::into)
    }

    pub fn send_transaction(&self, tx: &Transaction) -> anyhow::Result<Signature> {
        let wire = bincode::DefaultOptions::new()
            .with_fixint_encoding()
            .reject_trailing_bytes()
            .serialize(tx)
            .context("serialize tx")?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(wire);
        let r = self.post(
            "sendTransaction",
            json!([
                b64,
                {
                    "encoding": "base64",
                    "skipPreflight": false,
                    "preflightCommitment": self.commitment.commitment.to_string(),
                }
            ]),
        )?;
        let s = r.as_str().ok_or_else(|| anyhow!("sendTransaction result"))?;
        Signature::from_str(s).map_err(Into::into)
    }

    pub fn confirm_signature(&self, sig: &Signature) -> anyhow::Result<()> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(90);
        while std::time::Instant::now() < deadline {
            let r = self.post(
                "getSignatureStatuses",
                json!([[sig.to_string()], { "searchTransactionHistory": true }]),
            )?;
            let st = r
                .get("value")
                .and_then(|v| v.as_array())
                .and_then(|a| a.get(0))
                .and_then(|x| x.as_object());
            if let Some(obj) = st {
                if let Some(err) = obj.get("err") {
                    if !err.is_null() {
                        return Err(anyhow!("transaction failed: {err}"));
                    }
                }
                let status = obj
                    .get("confirmationStatus")
                    .and_then(|s| s.as_str())
                    .unwrap_or("");
                if status == "confirmed" || status == "finalized" {
                    return Ok(());
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(400));
        }
        Err(anyhow!("timeout confirming {}", sig))
    }

    pub fn send_and_confirm_transaction(&self, tx: &Transaction) -> anyhow::Result<Signature> {
        let sig = self.send_transaction(tx)?;
        self.confirm_signature(&sig)?;
        Ok(sig)
    }

    pub fn get_slot(&self) -> anyhow::Result<u64> {
        let r = self.post("getSlot", json!([{ "commitment": self.commitment.commitment.to_string() }]))?;
        r.as_u64().ok_or_else(|| anyhow!("getSlot"))
    }
}

fn parse_rent_epoch(v: Option<&Value>) -> anyhow::Result<Epoch> {
    let n: u64 = match v {
        None => 0,
        Some(Value::Number(n)) => n.as_u64().ok_or_else(|| anyhow!("rentEpoch number"))?,
        Some(Value::String(s)) => s.parse::<u64>().map_err(|_| anyhow!("rentEpoch parse"))?,
        _ => 0,
    };
    Ok(n)
}

const DISC_DWALLET: u8 = 2;

pub async fn wait_for_coordinator(
    rpc: &RpcLight,
    dwallet_program: &Pubkey,
) -> anyhow::Result<()> {
    let (coordinator, _) = Pubkey::find_program_address(&[b"dwallet_coordinator"], dwallet_program);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
    while std::time::Instant::now() < deadline {
        if let Ok(Some(acc)) = rpc.get_account(&coordinator) {
            if acc.data.len() >= 116 && acc.data[0] == 1 {
                return Ok(());
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err(anyhow!("timeout waiting for DWalletCoordinator account"))
}

pub async fn poll_dwallet_live(rpc: &RpcLight, dwallet_pda: &Pubkey) -> anyhow::Result<()> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
    while std::time::Instant::now() < deadline {
        if let Ok(Some(acc)) = rpc.get_account(dwallet_pda) {
            if acc.data.len() > 2 && acc.data[0] == DISC_DWALLET {
                return Ok(());
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err(anyhow!(
        "timeout waiting for dWallet account {}",
        dwallet_pda
    ))
}
