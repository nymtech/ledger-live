import { BigNumber } from "bignumber.js"
import type { NymDelegationInfo, Transaction } from "./types"

/**
 * Create an empty transaction
 *
 * @returns {Transaction}
 */
const createTransaction = (): Transaction => ({
  family: "nym",
  mode: "send",
  amount: new BigNumber(0),
  fees: null,
  gas: null,
  recipient: "",
  useAllAmount: false,
  networkInfo: null,
  memo: null,
  sourceValidator: null,
  validators: [] as NymDelegationInfo[],
})

export default createTransaction
