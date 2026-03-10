import { Hex, toHex } from "viem";
import { Network } from "../client";
import { getAddressesFromCoreExtension } from "./utils";
import { toAccount } from "viem/accounts";
import { ExtendedAccount } from "../client";


export async function getCoreWalletAccount(network: Network) {
  const provider = (window as any).avalanche
  if (!provider) throw new Error('Core extension not found. Please install Core. https://core.app')

  // Request account access
  await provider.request({ method: 'eth_requestAccounts', params: [] });

  const { evm, XP } = await provider.request({
    "method": "avalanche_getAccountPubKey",
    "params": []
  });
  const addresses = getAddressesFromCoreExtension({ evm, XP }, network);

  return {
    pChainAddress: addresses.P,
    cSign: async (parameters: { hash: Hex }) => {
      const { hash } = parameters;
      return await provider.request({
        "method": "eth_sign",
        "params": [
          addresses.C,
          hash
        ]
      });
    },
    ...toAccount({
      address: addresses.C,
      publicKey: evm,

      // Core Wallet handles signing + broadcasting via eth_sendTransaction.
      // signTransaction (returning a serialized signed tx) is not supported.
      async signTransaction(_transaction) {
        throw new Error(
          'Core Wallet does not support signTransaction (sign-only without broadcast). ' +
          'Use eth_sendTransaction via the provider instead.'
        );
      },

      async signMessage({ message }) {
        let messageHex: string;

        if (typeof message === 'string') {
          messageHex = toHex(message);
        } else {
          messageHex = typeof message.raw === 'string'
            ? message.raw
            : toHex(message.raw);
        }

        return await provider.request({
          method: 'personal_sign',
          params: [messageHex, addresses.C]
        });
      },

      async sign(parameters: { hash: Hex }) {
        const { hash } = parameters;
        return await provider.request({
          method: 'avalanche_signMessage',
          params: [hash]
        });
      },

      async signTypedData(parameters: any) {
        const { domain, types, primaryType, message } = parameters;
        return await provider.request({
          method: 'eth_signTypedData_v4',
          params: [
            addresses.C,
            JSON.stringify({ domain, types, primaryType, message })
          ]
        });
      }
    })
  } as ExtendedAccount;
}
