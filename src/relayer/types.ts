export interface WithdrawRequestBody {
  proof: number[];
  root: number[];
  nullifierHash: number[];
  recipient: string;
  amount: string;
  fee: string;
  treasury: string;
  rpcUrl?: string;
}

export interface WithdrawResponse {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface RelayerInfo {
  publicKey: string;
  stakeAmount: string;
  feeBps: number;
  url: string;
  isActive: boolean;
}
