const REGION = process.env.AWS_REGION || 'local-env';
const ENDPOINT = 'http://172.17.0.2:8000';
const TABLE_NAME = process.env.TABLE_NAME || 'ParksAr-tests';
const CONFIG_TABLE_NAME = process.env.CONFIG_TABLE_NAME || 'ConfigAr-tests';
const NAME_CACHE_TABLE_NAME = process.env.NAME_CACHE_TABLE_NAME || 'NameCacheAr-tests';


module.exports = {
  REGION,
  ENDPOINT,
  TABLE_NAME,
  CONFIG_TABLE_NAME,
  NAME_CACHE_TABLE_NAME
};
 