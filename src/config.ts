import dotenv from 'dotenv';
import * as os from 'os';

dotenv.config();

export const confPath = os.homedir() + '/.suzaku-cli';
