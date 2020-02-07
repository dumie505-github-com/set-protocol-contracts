import * as _ from 'lodash';
import { Address } from 'set-protocol-utils';
import { BigNumber } from 'bignumber.js';
import * as setProtocolUtils from 'set-protocol-utils';

import {
  OracleWhiteListContract,
  RebalancingSetFeeMockContract,
  RebalancingSetTokenV2Contract,
  RebalancingSetTokenV3Contract,
  SetTokenContract,
} from '../contracts';
import {
  ZERO
} from '../constants';

import { CoreHelper } from './coreHelper';
import { ERC20Helper } from './erc20Helper';
import { OracleHelper } from './oracleHelper';

const { SetProtocolUtils: SetUtils } = setProtocolUtils;
const {
  SET_FULL_TOKEN_UNITS,
} = SetUtils.CONSTANTS;

export class ValuationHelper {
  private _contractOwnerAddress: Address;
  private _coreHelper: CoreHelper;
  private _erc20Helper: ERC20Helper;
  private _oracleHelper: OracleHelper;

  constructor(contractOwnerAddress: Address,
    coreHelper: CoreHelper,
    erc20Helper: ERC20Helper,
    oracleHelper: OracleHelper
  ) {
    this._contractOwnerAddress = contractOwnerAddress;
    this._coreHelper = coreHelper;
    this._erc20Helper = erc20Helper;
    this._oracleHelper = oracleHelper;
  }

  public async calculateSetTokenValueAsync(
    setToken: SetTokenContract,
    oracleWhiteList: OracleWhiteListContract,
    from: Address = this._contractOwnerAddress,
  ): Promise<BigNumber> {
    const componentTokens = await setToken.getComponents.callAsync();

    const tokenPrices = await this._oracleHelper.getComponentPricesAsync(
      componentTokens,
      oracleWhiteList
    );
    const componentUnits = await setToken.getUnits.callAsync();
    const setNaturalUnit = await setToken.naturalUnit.callAsync();
    const componentDecimals = await this._erc20Helper.getTokensDecimalsAsync(componentTokens);

    let setTokenPrice = ZERO;
    for (let i = 0; i < componentUnits.length; i++) {
      const tokenUnitsInFullSet = SET_FULL_TOKEN_UNITS
                                    .mul(componentUnits[i])
                                    .div(setNaturalUnit)
                                    .round(0, 3);
      const componentValue = this.computeTokenDollarAmount(
        tokenPrices[i],
        tokenUnitsInFullSet,
        componentDecimals[i],
      );
      setTokenPrice = setTokenPrice.add(componentValue);
    }

    return setTokenPrice;
  }

  public async calculateRebalancingSetTokenValueAsync(
    rebalancingSetToken: RebalancingSetFeeMockContract | RebalancingSetTokenV2Contract | RebalancingSetTokenV3Contract,
    oracleWhiteList: OracleWhiteListContract
  ): Promise<BigNumber> {
    const currentSetAddress = await rebalancingSetToken.currentSet.callAsync();
    const currentSetInstance = await this._coreHelper.getSetInstance(currentSetAddress);

    const collateralValue = await this.calculateSetTokenValueAsync(currentSetInstance, oracleWhiteList);

    const unitShares = await rebalancingSetToken.unitShares.callAsync();
    const naturalUnit = await rebalancingSetToken.naturalUnit.callAsync();

    return collateralValue.mul(unitShares).div(naturalUnit).round(0, 3);
  }

  private computeTokenDollarAmount(
    tokenPrice: BigNumber,
    unitsInFullSet: BigNumber,
    tokenDecimals: BigNumber,
  ): BigNumber {
    return tokenPrice
             .mul(unitsInFullSet)
             .div(10 ** tokenDecimals.toNumber())
             .round(0, 3);
  }
}