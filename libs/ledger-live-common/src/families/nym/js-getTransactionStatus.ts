import {
  AmountRequired,
  FeeNotLoaded,
  InvalidAddress,
  InvalidAddressBecauseDestinationIsAlsoSource,
  NotEnoughBalance,
  RecipientRequired,
  RecommendUndelegation,
} from "@ledgerhq/errors"
import {
  ClaimRewardsFeesWarning,
  NymDelegateAllFundsWarning,
  NymRedelegationInProgress,
  NymTooManyValidators,
  NotEnoughDelegationBalance,
} from "../../errors"
import {
  NymLikeTransaction,
  StatusErrorMap,
  NymAccount,
  TransactionStatus,
} from "./types"
import { BigNumber } from "bignumber.js"
import {
  NYM_MAX_DELEGATIONS,
  NYM_MAX_REDELEGATIONS,
  NYM_MAX_UNBONDINGS,
  getMaxEstimatedBalance,
} from "./logic"
import invariant from "invariant"
import { NymAPI, defaultNymAPI } from "./api/Nym"
import { OsmosisAPI } from "../osmosis/api/sdk"

export class NymTransactionStatusManager {
  protected _api: NymAPI = defaultNymAPI
  protected _validatorOperatorAddressPrefix = "nymvaloper"

  constructor(options?: {
    api?: NymAPI
    validatorOperatorAddressPrefix?: string
  }) {
    if (options?.validatorOperatorAddressPrefix) {
      this._validatorOperatorAddressPrefix =
        options.validatorOperatorAddressPrefix
    }
    if (options?.api) {
      this._api = options.api
    }
  }

  getTransactionStatus = async (
    a: NymAccount,
    t: NymLikeTransaction
  ): Promise<TransactionStatus> => {
    if (t.mode === "send") {
      // We isolate the send transaction that it's a little bit different from the rest
      return await this.getSendTransactionStatus(a, t)
    } else if (t.mode === "delegate") {
      return await this.getDelegateTransactionStatus(a, t)
    }

    const errors: StatusErrorMap = {}
    const warnings: StatusErrorMap = {}
    // here we only treat about all other mode than delegate and send
    if (
      t.validators.some(
        (v) =>
          !v.address ||
          !v.address.includes(this._validatorOperatorAddressPrefix)
      ) ||
      t.validators.length === 0
    )
      errors.recipient = new InvalidAddress(undefined, {
        currencyName: a.currency.name,
      })

    if (t.mode === "redelegate") {
      const redelegationError = this.redelegationStatusError(a, t)

      if (redelegationError) {
        // Note : note sure if I have to put this error on this field
        errors.redelegation = redelegationError
      }
    } else if (t.mode === "undelegate") {
      invariant(
        a.nymResources && a.nymResources.unbondings.length < NYM_MAX_UNBONDINGS,
        "unbondings should not have more than 6 entries"
      )
      if (t.validators.length === 0)
        errors.recipient = new InvalidAddress(undefined, {
          currencyName: a.currency.name,
        })
      const [first] = t.validators
      const unbondingError =
        first && this.isDelegable(a, first.address, first.amount)

      if (unbondingError) {
        errors.unbonding = unbondingError
      }
    }

    const validatorAmount = t.validators.reduce(
      (old, current) => old.plus(current.amount),
      new BigNumber(0)
    )

    if (t.mode !== "claimReward" && validatorAmount.lte(0)) {
      errors.amount = new AmountRequired()
    }

    const estimatedFees = t.fees || new BigNumber(0)

    if (!t.fees) {
      errors.fees = new FeeNotLoaded()
    }

    let totalSpent = estimatedFees

    if (["claimReward", "claimRewardCompound"].includes(t.mode)) {
      const { nymResources } = a
      invariant(nymResources, "nymResources should exist")
      const claimReward =
        t.validators.length && nymResources
          ? nymResources.delegations.find(
              (delegation) =>
                delegation.validatorAddress === t.validators[0].address
            )
          : null

      if (claimReward && estimatedFees.gt(claimReward.pendingRewards)) {
        warnings.claimReward = new ClaimRewardsFeesWarning()
      }
    }

    if (
      !errors.recipient &&
      !errors.amount &&
      (validatorAmount.lt(0) || totalSpent.gt(a.spendableBalance))
    ) {
      errors.amount = new NotEnoughBalance()
      totalSpent = new BigNumber(0)
    }

    return Promise.resolve({
      errors,
      warnings,
      estimatedFees,
      amount: new BigNumber(0),
      totalSpent,
    })
  }

  private getDelegateTransactionStatus = async (
    a: NymAccount,
    t: NymLikeTransaction
  ): Promise<TransactionStatus> => {
    const errors: StatusErrorMap = {}
    const warnings: StatusErrorMap = {}
    if (
      t.validators.some(
        (v) =>
          !v.address ||
          !v.address.includes(this._validatorOperatorAddressPrefix)
      ) ||
      t.validators.length === 0
    )
      errors.recipient = new InvalidAddress(undefined, {
        currencyName: a.currency.name,
      })

    if (t.validators.length > NYM_MAX_DELEGATIONS) {
      errors.validators = new NymTooManyValidators()
    }

    const estimatedFees = t.fees || new BigNumber(0)

    if (this._api instanceof OsmosisAPI) {
      if (!t.fees) {
        errors.fees = new FeeNotLoaded()
      }
    } else {
      if (!t.fees || !t.fees.gt(0)) {
        errors.fees = new FeeNotLoaded()
      }
    }
    let amount

    // TODO, refactor this block. We should use nymResources for Osmosis
    if (this._api instanceof OsmosisAPI) {
      amount = t.useAllAmount
        ? a.spendableBalance.minus(estimatedFees)
        : new BigNumber(t.amount)
    } else {
      amount = t.useAllAmount
        ? getMaxEstimatedBalance(a, estimatedFees)
        : t.amount
    }
    const totalSpent = amount.plus(estimatedFees)

    if (amount.eq(0)) {
      errors.amount = new AmountRequired()
    }

    if (
      !errors.recipient &&
      !errors.amount &&
      (amount.lt(0) || totalSpent.gt(a.spendableBalance))
    ) {
      errors.amount = new NotEnoughBalance()
    }

    if (!errors.amount && t.useAllAmount) {
      warnings.amount = new NymDelegateAllFundsWarning()
    }

    return Promise.resolve({
      errors,
      warnings,
      estimatedFees,
      amount,
      totalSpent,
    })
  }

  private getSendTransactionStatus = async (
    a: NymAccount,
    t: NymLikeTransaction
  ): Promise<TransactionStatus> => {
    const errors: StatusErrorMap = {}
    const warnings: StatusErrorMap = {}

    if (!t.recipient) {
      errors.recipient = new RecipientRequired("")
    } else if (a.freshAddress === t.recipient) {
      errors.recipient = new InvalidAddressBecauseDestinationIsAlsoSource()
    } else {
      if (!(await this._api.isValidRecipent(t.recipient))) {
        errors.recipient = new InvalidAddress(undefined, {
          currencyName: a.currency.name,
        })
      }
    }

    let amount = t.amount

    if (amount.lte(0) && !t.useAllAmount) {
      errors.amount = new AmountRequired()
    }

    const estimatedFees = t.fees || new BigNumber(0)

    if (this._api instanceof OsmosisAPI) {
      if (!t.fees) {
        errors.fees = new FeeNotLoaded()
      }
    } else {
      if (!t.fees || !t.fees.gt(0)) {
        errors.fees = new FeeNotLoaded()
      }
    }

    amount = t.useAllAmount ? getMaxEstimatedBalance(a, estimatedFees) : amount
    const totalSpent = amount.plus(estimatedFees)

    if (
      (amount.lte(0) && t.useAllAmount) || // if use all Amount sets an amount at 0
      (!errors.recipient && !errors.amount && totalSpent.gt(a.spendableBalance)) // if spendable balance lower than total
    ) {
      errors.amount = new NotEnoughBalance()
    }

    if (
      a.nymResources &&
      a.nymResources.delegations.length > 0 &&
      t.useAllAmount
    ) {
      warnings.amount = new RecommendUndelegation()
    }

    return Promise.resolve({
      errors,
      warnings,
      estimatedFees,
      amount,
      totalSpent,
    })
  }

  private redelegationStatusError = (a: NymAccount, t: NymLikeTransaction) => {
    if (a.nymResources) {
      const redelegations = a.nymResources.redelegations
      invariant(
        redelegations.length < NYM_MAX_REDELEGATIONS,
        "redelegation should not have more than 6 entries"
      )

      if (
        redelegations.some((redelegation) => {
          const dstValidator = redelegation.validatorDstAddress
          return (
            dstValidator === t.sourceValidator &&
            redelegation.completionDate > new Date()
          )
        })
      ) {
        return new NymRedelegationInProgress()
      }

      if (t.validators.length > 0) {
        if (t.sourceValidator === t.validators[0].address) {
          return new InvalidAddressBecauseDestinationIsAlsoSource()
        } else {
          return this.isDelegable(a, t.sourceValidator, t.validators[0].amount)
        }
      }
    }

    return null
  }

  private isDelegable = (
    a: NymAccount,
    address: string | undefined | null,
    amount: BigNumber
  ) => {
    const { nymResources } = a
    invariant(nymResources, "nymResources should exist")

    if (
      nymResources &&
      nymResources.delegations.some(
        (delegation) =>
          delegation.validatorAddress === address &&
          delegation.amount.lt(amount)
      )
    ) {
      return new NotEnoughDelegationBalance()
    }

    return null
  }
}

const nymTransactionStatusManager = new NymTransactionStatusManager()

export default nymTransactionStatusManager.getTransactionStatus
