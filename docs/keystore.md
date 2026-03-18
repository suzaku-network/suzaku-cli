# Keystore — Managing signing keys with `pass`

This document explains how to set up and use the Suzaku CLI **keystore** to securely manage private keys. The keystore is backed by [**pass**](https://www.passwordstore.org/) (the standard unix password manager), which encrypts secrets with your GPG key.

> **Why the keystore?** `--private-key` (raw hex key) is **blocked on mainnet** by the CLI. Use `-s <secret-name>` everywhere instead — it retrieves the private key from the encrypted store at runtime without exposing it in your shell history.

All keystore commands live under the `key` subcommand group:

```
suzaku-cli key <command>
```

## Prerequisites

- **GPG** installed and a keypair available (`gpg --list-secret-keys`).
- **pass** installed (`apt install pass` / `brew install pass`).

If you don't have a GPG key yet:

```bash
gpg --full-generate-key   # choose RSA 4096, set passphrase
```

## 1. Find your GPG key ID

```bash
suzaku-cli key list-gpg-ids
```

This lists all GPG key IDs installed on your system. Note the ID of the key you want to use for encryption (e.g. `ABC123DEF456`).

You can also run:

```bash
gpg --list-secret-keys --keyid-format=long
```

## 2. Initialize the keystore

Initialize the encrypted store with one or more GPG key IDs (multiple IDs = multiple recipients can decrypt).

```bash
suzaku-cli key init ABC123DEF456   # <gpgKeyId...>
```

This creates the password store directory (used by `pass`) under the CLI config directory.

## 3. Create a secret

Store a private key under a name. Use that name later with `-s <name>` when signing transactions.

**From the clipboard** (recommended — key never appears on screen):

```bash
# Copy the private key (0x...) to your clipboard first, then:
suzaku-cli key create operator -c
```

**Interactive prompt** (typed, not echoed):

```bash
suzaku-cli key create operator -p
```

**Inline value** (⚠️ appears in shell history — testnet only):

```bash
suzaku-cli key create operator -v 0xabc123...   # <privateKey>
```

> Choose descriptive names that reflect the role: `admin`, `operator`, `staker`, etc.

## 4. List stored secrets

```bash
suzaku-cli key list
```

Shows all secret names and their corresponding addresses:

```
Available secrets:
  operator   C-Chain: 0x1234...
  admin      C-Chain: 0xabcd...
```

Use `--hide-addresses` to omit addresses:

```bash
suzaku-cli key list --hide-addresses
```

## 5. Show an address

Display the C-Chain and P-Chain addresses for a stored secret without revealing the private key:

```bash
suzaku-cli key addresses operator   # <secret-name>
```

## 6. Remove a secret

```bash
suzaku-cli key rm operator   # <secret-name>
```

The CLI will ask for confirmation. Use `-y` to skip:

```bash
suzaku-cli key rm operator -y
```

## 7. Using a secret to sign transactions

Pass `-s <secret-name>` to any write command instead of `--private-key`:

```bash
suzaku-cli staking-vault deposit 100 0 -s staker
suzaku-cli kite-staking-manager initiate-validator-registration ... -s operator
```

The CLI decrypts the key at runtime using your GPG agent (you may be prompted for your GPG passphrase once per session).

## 8. Using a Ledger hardware wallet

As an alternative to the keystore, pass `--ledger` to any write command:

```bash
suzaku-cli staking-vault deposit 100 0 --ledger
```

The CLI will prompt you to confirm the transaction on the device.

## Summary

| Command | Description |
|---|---|
| `key list-gpg-ids` | List GPG key IDs available on this system |
| `key init <gpgKeyId...>` | Initialize the keystore with one or more GPG keys |
| `key create <name> -c\|-p\|-v <val>` | Store a new private key under `<name>` |
| `key list` | List all stored secrets and their addresses |
| `key addresses <name>` | Show addresses for a stored secret |
| `key rm <name>` | Delete a stored secret |
