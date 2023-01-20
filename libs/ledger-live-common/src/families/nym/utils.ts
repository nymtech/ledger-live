// Import here other Nym-based Ledger Validators
import type { AccountLike } from "@ledgerhq/types-live";
import { LEDGER_OSMOSIS_VALIDATOR_ADDRESS } from "../osmosis/utils";
import { NymAccount } from "./types";

export const LEDGER_VALIDATOR_ADDRESS =
  "nymvaloper10wljxpl03053h9690apmyeakly3ylhejrucvtm";

export const NYM_FAMILY_LEDGER_VALIDATOR_ADDRESSES = [
  LEDGER_VALIDATOR_ADDRESS,
  LEDGER_OSMOSIS_VALIDATOR_ADDRESS,
];

export function isNymAccount(
  account?: AccountLike | null
): account is NymAccount {
  return (account as NymAccount)?.nymResources !== undefined;
}
