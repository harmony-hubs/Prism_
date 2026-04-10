export {
  DWALLET_BOOK_PARTS,
  DWALLET_FLOW_STEPS,
  IKA_GITHUB,
  IKA_PUBLIC_SITE,
  IKA_SOLANA_PREALPHA_GUIDE,
  IKA_SOLANA_PREALPHA_INTRO,
  IKA_SOLANA_PREALPHA_PRINT,
  IKA_TYPESCRIPT_SDK_DOCS,
  PRE_ALPHA_DISCLAIMER_SHORT,
} from './solanaGuide';
export { createSolanaConnection } from './solanaConnection';
export {
  connectPhantomWallet,
  disconnectPhantomWallet,
  getInjectedSolana,
  readConnectedPubkey,
} from './phantomWallet';
export type { SolanaInjectedWallet } from './phantomWallet';
export {
  APPROVAL_SIG_OFFSET,
  APPROVAL_STATUS_OFFSET,
  authorityMatchesCpiPda,
  deriveCpiAuthorityPda,
  deriveMessageApprovalPda,
  DWALLET_CURVE_OFFSET,
  fetchAccountInfoBase64,
  parseDWalletAccountData,
  parseMessageApprovalData,
} from './solanaOnChain';
export type { ParsedDWalletAccount, ParsedMessageApproval } from './solanaOnChain';
