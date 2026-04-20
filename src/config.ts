import dotenv from 'dotenv';
import * as os from 'os';
import { getConfig, pChainChainID } from '@suzaku-sdk/node';
import type { Config } from '@suzaku-sdk/node';

dotenv.config();

export const confPath = os.homedir() + '/.suzaku-cli';

export { getConfig, pChainChainID };
export type { Config };
