import Prando from "prando";
import { BigNumber } from "bignumber.js";
import type { Account, Operation, OperationType } from "@ledgerhq/types-live";
import type {
  NymResources,
  NymDelegation,
  NymUnbonding,
  NymRedelegation,
  NymAccount,
} from "./types";
import preloadedData from "./preloadedData.mock";
import { genHex, genAddress } from "../../mock/helpers";
const { validators } = preloadedData;

function setNymResources(
  account: NymAccount,
  delegations: NymDelegation[],
  unbondingBalance: BigNumber = new BigNumber(0),
  unbondings: NymUnbonding[] | null | undefined,
  redelegations: NymRedelegation[] | null | undefined
): Account {
  /** format nymResources given the new delegations */
  account.nymResources = {
    delegations,
    delegatedBalance: delegations.reduce(
      (sum, { amount }) => sum.plus(amount),
      new BigNumber(0)
    ),
    pendingRewardsBalance: delegations.reduce(
      (sum, { pendingRewards }) => sum.plus(pendingRewards),
      new BigNumber(0)
    ),
    unbondingBalance: account.nymResources
      ? account.nymResources.unbondingBalance.plus(unbondingBalance)
      : unbondingBalance,
    withdrawAddress: account.id,
    unbondings: unbondings ?? account.nymResources?.unbondings ?? [],
    redelegations: redelegations ?? account.nymResources?.redelegations ?? [],
  };
  return account;
}

function setOperationFeeValue(
  operation: Operation,
  base: BigNumber
): Operation {
  operation.fee = new BigNumber(Math.round(base.toNumber() * 0.001));
  operation.value = operation.fee;
  return operation;
}

function genBaseOperation(
  account: NymAccount,
  rng: Prando,
  type: OperationType,
  index: number
): Operation {
  const { operations: ops } = account;
  const address = genAddress(account.currency, rng);
  const lastOp = ops[index];
  const date = new Date(
    (lastOp ? lastOp.date.valueOf() : Date.now()) -
      rng.nextInt(0, 100000000 * rng.next() * rng.next())
  );
  const hash = genHex(64, rng);

  /** generate given operation */
  return {
    id: String(`mock_op_${ops.length}_${type}_${account.id}`),
    hash,
    type,
    value: new BigNumber(0),
    fee: new BigNumber(0),
    senders: [address],
    recipients: [address],
    blockHash: genHex(64, rng),
    blockHeight:
      account.blockHeight - Math.floor((Date.now() - date.valueOf()) / 900000),
    accountId: account.id,
    date,
    extra: {},
  };
}

/**
 * Generates a nym delegation operation updating both operations list and account nym resources
 * @memberof nym/mock
 * @param {NymAccount} account
 * @param {Prando} rng
 */
function addDelegationOperation(account: NymAccount, rng: Prando): Account {
  const { spendableBalance } = account;
  const nymResources: NymResources = account.nymResources
    ? account.nymResources
    : {
        delegations: [],
        delegatedBalance: new BigNumber(0),
        pendingRewardsBalance: new BigNumber(0),
        unbondingBalance: new BigNumber(0),
        withdrawAddress: "",
        unbondings: [],
        redelegations: [],
      };
  if (spendableBalance.isZero()) return account;

  /** select position on the operation stack where we will insert the new delegation */
  const opIndex = rng.next(0, 10);
  const delegationOp = genBaseOperation(account, rng, "DELEGATE", opIndex);
  const feeOp = genBaseOperation(account, rng, "FEES", opIndex);
  const value = spendableBalance.plus(nymResources.delegatedBalance);

  /** select between 3 to 5 validators and split the amount evenly */
  const delegatedValidators = Array.from({
    length: rng.nextInt(3, 5),
  })
    .map(() => rng.nextArrayItem(validators))
    .filter(
      (validator, index, arr) =>
        arr.findIndex(
          (v) => v.validatorAddress === validator.validatorAddress
        ) === index
    )
    .map(({ validatorAddress }, i, arr) => ({
      address: validatorAddress,
      amount: new BigNumber(
        Math.round(value.toNumber() * rng.next(0.1, 1 / arr.length))
      ),
    }));
  delegationOp.extra = {
    validators: delegatedValidators,
  };

  /** format delegations and randomize rewards and status */
  const delegations: NymDelegation[] = delegatedValidators.map(
    ({ address, amount }) => ({
      validatorAddress: address,
      amount,
      pendingRewards: rng.nextBoolean()
        ? new BigNumber(Math.round(amount.toNumber() * 0.01))
        : new BigNumber(0),
      status: rng.next() > 0.33 ? "bonded" : "unbonded",
    })
  );
  setNymResources(account, delegations, undefined, undefined, undefined);
  setOperationFeeValue(
    delegationOp,
    account.nymResources
      ? account.nymResources.delegatedBalance
      : new BigNumber(0)
  );
  setOperationFeeValue(
    feeOp,
    account.nymResources
      ? account.nymResources.delegatedBalance
      : new BigNumber(0)
  );
  postSyncAccount(account);
  account.operations.splice(opIndex, 0, delegationOp, feeOp);
  account.operationsCount += 2;
  return account;
}

/**
 * Generates a nym redelegation operation updating both operations list and account nym resources
 * @memberof nym/mock
 * @param {NymAccount} account
 * @param {Prando} rng
 */
function addRedelegationOperation(account: NymAccount, rng: Prando): Account {
  const nymResources: NymResources = account.nymResources
    ? account.nymResources
    : {
        delegations: [],
        delegatedBalance: new BigNumber(0),
        pendingRewardsBalance: new BigNumber(0),
        unbondingBalance: new BigNumber(0),
        withdrawAddress: "",
        unbondings: [],
        redelegations: [],
      };
  if (!nymResources.delegations.length) return account;

  /** select position on the operation stack where we will insert the new delegation */
  const opIndex = rng.next(0, 10);
  const redelegationOp = genBaseOperation(account, rng, "REDELEGATE", opIndex);
  const fromDelegation = rng.nextArrayItem(nymResources.delegations);
  const amount = new BigNumber(
    Math.round(fromDelegation.amount.toNumber() * rng.next(0.1, 1))
  );
  const toDelegation = rng.nextArrayItem(validators);
  redelegationOp.extra = {
    validator: {
      address: toDelegation.validatorAddress,
      amount,
    },
    sourceValidator: fromDelegation.validatorAddress,
  };
  const delegations = nymResources.delegations
    .filter(
      ({ validatorAddress }) =>
        validatorAddress === fromDelegation.validatorAddress
    )
    .concat([
      {
        validatorAddress: toDelegation.validatorAddress,
        amount,
        pendingRewards: rng.nextBoolean()
          ? new BigNumber(Math.round(amount.toNumber() * 0.01))
          : new BigNumber(0),
        status: rng.next() > 0.33 ? "bonded" : "unbonded",
      },
    ]);
  setNymResources(account, delegations, undefined, undefined, [
    {
      validatorSrcAddress: fromDelegation.validatorAddress,
      validatorDstAddress: toDelegation.validatorAddress,
      amount,
      completionDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    },
  ]);
  setOperationFeeValue(redelegationOp, amount);
  account.operations.splice(opIndex, 0, redelegationOp);
  account.operationsCount++;
  return account;
}

/**
 * Generates a nym redelegation operation updating both operations list and account nym resources
 * @memberof nym/mock
 * @param {NymAccount} account
 * @param {Prando} rng
 */
function addClaimRewardsOperation(account: NymAccount, rng: Prando): Account {
  const nymResources: NymResources = account.nymResources
    ? account.nymResources
    : {
        delegations: [],
        delegatedBalance: new BigNumber(0),
        pendingRewardsBalance: new BigNumber(0),
        unbondingBalance: new BigNumber(0),
        withdrawAddress: "",
        unbondings: [],
        redelegations: [],
      };
  if (!nymResources.delegations.length) return account;

  /** select position on the operation stack where we will insert the new claim rewards */
  const opIndex = rng.next(0, 10);
  const claimRewardOp = genBaseOperation(account, rng, "REWARD", opIndex);
  const fromDelegation = rng.nextArrayItem(nymResources.delegations);
  const amount = fromDelegation.pendingRewards.gt(0)
    ? fromDelegation.pendingRewards
    : new BigNumber(Math.round(fromDelegation.amount.toNumber() * 0.01));
  claimRewardOp.extra = {
    validator: {
      address: fromDelegation.validatorAddress,
      amount,
    },
  };
  const delegations = nymResources.delegations.map((delegation) => ({
    ...delegation,
    pendingRewards:
      delegation.validatorAddress === fromDelegation.validatorAddress
        ? new BigNumber(0)
        : delegation.pendingRewards,
  }));
  setNymResources(account, delegations, undefined, undefined, undefined);
  claimRewardOp.fee = new BigNumber(Math.round(amount.toNumber() * 0.001));
  claimRewardOp.value = amount;
  account.operations.splice(opIndex, 0, claimRewardOp);
  account.operationsCount++;
  return account;
}

/**
 * Generates a nym undelegation operation updating both operations list and account nym resources
 * @memberof nym/mock
 * @param {NymAccount} account
 * @param {Prando} rng
 */
function addUndelegationOperation(account: NymAccount, rng: Prando): Account {
  const nymResources: NymResources = account.nymResources
    ? account.nymResources
    : {
        delegations: [],
        delegatedBalance: new BigNumber(0),
        pendingRewardsBalance: new BigNumber(0),
        unbondingBalance: new BigNumber(0),
        withdrawAddress: "",
        unbondings: [],
        redelegations: [],
      };
  if (!nymResources.delegations.length) return account;

  /** select position on the operation stack where we will insert the new claim rewards */
  const opIndex = rng.next(0, 10);
  const undelegationOp = genBaseOperation(account, rng, "UNDELEGATE", opIndex);
  const fromDelegation = rng.nextArrayItem(nymResources.delegations);
  const amount = new BigNumber(
    Math.round(
      fromDelegation.amount.toNumber() *
        (rng.nextBoolean() ? rng.next(0.1, 1) : 1)
    )
  );
  const claimedReward = fromDelegation.pendingRewards;
  undelegationOp.extra = {
    validator: {
      address: fromDelegation.validatorAddress,
      amount,
    },
  };
  const delegations = nymResources.delegations
    .map((delegation) => ({
      ...delegation,
      amount:
        delegation.validatorAddress === fromDelegation.validatorAddress
          ? delegation.amount.minus(amount)
          : delegation.amount,
      pendingRewards: new BigNumber(0),
    }))
    .filter(({ amount }) => amount.gt(0));
  setNymResources(
    account,
    delegations,
    amount,
    [
      {
        validatorAddress: fromDelegation.validatorAddress,
        amount,
        completionDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      },
    ],
    undefined
  );
  undelegationOp.fee = new BigNumber(Math.round(amount.toNumber() * 0.001));
  undelegationOp.value = undelegationOp.fee.minus(claimedReward);
  account.operations.splice(opIndex, 0, undelegationOp);
  account.operationsCount++;
  return account;
}

/**
 * add in specific nym operations
 * @memberof nym/mock
 * @param {NymAccount} account
 * @param {Prando} rng
 */
function genAccountEnhanceOperations(
  account: NymAccount,
  rng: Prando
): Account {
  addDelegationOperation(account, rng);
  addRedelegationOperation(account, rng);
  addClaimRewardsOperation(account, rng);
  addUndelegationOperation(account, rng);
  addDelegationOperation(account, rng);
  return account;
}

/**
 * Update spendable balance for the account based on delegation data
 * @memberof nym/mock
 * @param {NymAccount} account
 */
function postSyncAccount(account: NymAccount): Account {
  const nymResources = account?.nymResources;
  const delegatedBalance = nymResources?.delegatedBalance ?? new BigNumber(0);
  const unbondingBalance = nymResources?.unbondingBalance ?? new BigNumber(0);
  account.spendableBalance = account.balance
    .minus(delegatedBalance)
    .minus(unbondingBalance);
  return account;
}

/**
 * post account scan data logic
 * clears account nym resources if supposed to be empty
 * @memberof nym/mock
 * @param {Account} account
 */
function postScanAccount(
  account: NymAccount,
  {
    isEmpty,
  }: {
    isEmpty: boolean;
  }
): NymAccount {
  if (isEmpty) {
    account.nymResources = {
      delegations: [],
      delegatedBalance: new BigNumber(0),
      pendingRewardsBalance: new BigNumber(0),
      unbondingBalance: new BigNumber(0),
      withdrawAddress: account.id,
      unbondings: [],
      redelegations: [],
    };
    account.operations = [];
  }

  return account;
}

export default {
  genAccountEnhanceOperations,
  postSyncAccount,
  postScanAccount,
};
