import { from, Observable } from "rxjs"
import { map } from "rxjs/operators"
import invariant from "invariant"
import flatMap from "lodash/flatMap"
import zipWith from "lodash/zipWith"
import { BigNumber } from "bignumber.js"
import { Transaction as NymTransaction } from "./types"
import type { NymDelegationInfo } from "./types"
import nymValidatorsManager from "./validators"
import { AccountLike } from "@ledgerhq/types-live"

const options = [
  {
    name: "mode",
    type: String,
    desc: "mode of transaction: send, deletage, undelegate",
  },
  {
    name: "fees",
    type: String,
    desc: "how much fees",
  },
  {
    name: "gasLimit",
    type: String,
    desc: "how much gasLimit. default is estimated with the recipient",
  },
  {
    name: "memo",
    type: String,
    desc: "add a memo to a transaction",
  },
  {
    name: "sourceValidator",
    type: String,
    desc: "for redelegate, add a source validator",
  },
  {
    name: "nymValidator",
    type: String,
    multiple: true,
    desc: "address of recipient validator that will receive the delegate",
  },
  {
    name: "nymAmountValidator",
    type: String,
    multiple: true,
    desc: "Amount that the validator will receive",
  },
]

function inferTransactions(
  transactions: Array<{
    account: AccountLike
    transaction: NymTransaction
  }>,
  opts: Record<string, any>,
  { inferAmount }: any
): NymTransaction[] {
  return flatMap(transactions, ({ transaction, account }) => {
    invariant(transaction.family === "nym", "nym family")
    const validatorsAddresses: string[] = opts["nymValidator"] || []
    const validatorsAmounts: BigNumber[] = (
      opts["nymAmountValidator"] || []
    ).map((value) => {
      return inferAmount(account, value)
    })
    const validators: NymDelegationInfo[] = zipWith(
      validatorsAddresses,
      validatorsAmounts,
      (address, amount) => ({
        address,
        amount: amount || new BigNumber(0),
      })
    )
    return {
      ...transaction,
      family: "nym",
      mode: opts.mode || "send",
      memo: opts.memo,
      fees: opts.fees ? inferAmount(account, opts.fees) : null,
      gas: opts.gasLimit ? new BigNumber(opts.gasLimit) : null,
      validators: validators,
      sourceValidator: opts.sourceValidator,
    } as NymTransaction
  })
}

const nymValidatorsFormatters = {
  json: (list) => JSON.stringify(list),
  default: (list) =>
    list
      .map(
        (v) =>
          `${v.validatorAddress} "${v.name}" ${v.votingPower} ${v.commission} ${v.estimatedYearlyRewardsRate}`
      )
      .join("\n"),
}
const nymValidators = {
  args: [
    {
      name: "format",
      desc: Object.keys(nymValidatorsFormatters).join(" | "),
      type: String,
    },
  ],
  job: ({
    format,
  }: Partial<{
    format: string
  }>): Observable<string> =>
    from(nymValidatorsManager.getValidators()).pipe(
      map((validators) => {
        const f =
          (format && nymValidatorsFormatters[format]) ||
          nymValidatorsFormatters.default
        return f(validators)
      })
    ),
}
export default {
  options,
  inferTransactions,
  commands: {
    nymValidators,
  },
}
