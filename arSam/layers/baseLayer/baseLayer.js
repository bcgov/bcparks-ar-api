// Logger, ResponseUtils, VarianceUtils and DynamoUtils are all included in this baseLayer

// Logger
const { createLogger, format, transports } = require('winston');
const { combine, timestamp } = format;
const LEVEL = process.env.LOG_LEVEL || 'error';

const logger = createLogger({
  level: LEVEL,
  format: combine(
    timestamp(),
    format.printf((info) => {
      let meta = ''
      let symbols = Object.getOwnPropertySymbols(info)
      if (symbols.length == 2) {
        meta = JSON.stringify(info[symbols[1]])

      }
      return `${info.timestamp} ${[info.level.toUpperCase()]}: ${info.message} ${meta}`;
    })
  ),
  transports: [new transports.Console()]
});

// ResponseUtils
const sendResponse = function (code, data, context) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE'
    },
    body: JSON.stringify(data)
  };
  return response;
};

// VarianceUtils
function calculateVariance(
  historicalValues,
  currentValue,
  variancePercentage
) {
  const filteredInputs = historicalValues.filter((val) => val !== null && !isNaN(val));

  logger.info("=== Calculating variance ===");
  // We might receive two past years instead of three
  const numberOfYearsProvided = filteredInputs.length;
  logger.debug("Number of years provided:", numberOfYearsProvided);

  // Get the average value across provided years
  const averageHistoricValue = filteredInputs.reduce((acc, val) => acc + val, 0) / filteredInputs.length;
  logger.debug("Average historic value:", averageHistoricValue);

  // Calculate the percentage change only if averageHistoricValue is not zero
  let percentageChange;
  if (averageHistoricValue !== 0) {
    percentageChange = Math.round(((currentValue - averageHistoricValue) / averageHistoricValue) * 100) / 100;
  } else {
    // Set percentageChange to 0 or some other default value if averageHistoricValue is zero
    percentageChange = 0;
  }

  const percentageChangeAbs = Math.abs(percentageChange);

  const varianceMessage = `Variance triggered: ${percentageChangeAbs >= variancePercentage ? "+" : "-"}${Math.round(percentageChangeAbs * 100)}%`;

  // Since percentage change is absolute, we can subtract from variance percentage
  // If negative, variance is triggered
  const varianceTriggered = variancePercentage - percentageChangeAbs <= 0 ? true : false;
  logger.info("Variance Triggered:", varianceTriggered);
  logger.info("Variance percentageChange:", percentageChange);
  logger.info("Variance variancePercentage:", variancePercentage);

  const res = {
    varianceMessage: varianceMessage,
    varianceTriggered: varianceTriggered,
    percentageChange: +percentageChange,
    averageHistoricValue: averageHistoricValue
  };
  logger.info("Variance return obj:", res);
  logger.info("=== Variance calculation complete ===");
  return res;
}

// DynamoUtils
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME || "ParksAr-tests";
const ORCS_INDEX = process.env.ORCS_INDEX || "orcs-index";
const NAME_CACHE_TABLE_NAME = process.env.NAME_CACHE_TABLE_NAME || "NameCacheAr-tests";
const CONFIG_TABLE_NAME = process.env.CONFIG_TABLE_NAME || "ConfigAr-tests";
const MAX_TRANSACTION_SIZE = 25;
const AWS_REGION = process.env.AWS_REGION || "ca-central-1";
const DYNAMODB_ENDPOINT_URL = process.env.DYNAMODB_ENDPOINT_URL || "http://localhost:8000/";
const options = {
  region: AWS_REGION,
  endpoint: DYNAMODB_ENDPOINT_URL
};
if (process.env.IS_OFFLINE === 'true') {
  // If offline point at local
  options.endpoint = 'http://localhost:8000/';
}
const ACTIVE_STATUS = "active";
const RESERVED_STATUS = "reserved";
const EXPIRED_STATUS = "expired";
const PASS_TYPE_AM = "AM";
const PASS_TYPE_PM = "PM";
const PASS_TYPE_DAY = "DAY";
const TIMEZONE = "America/Vancouver";
const PM_ACTIVATION_HOUR = 12;
const PASS_TYPE_EXPIRY_HOURS = {
  AM: 12,
  PM: 0,
  DAY: 0,
};

const FISCAL_YEAR_FINAL_MONTH = 3; // March

const RECORD_ACTIVITY_LIST = [
  "Frontcountry Camping",
  "Frontcountry Cabins",
  "Backcountry Camping",
  "Backcountry Cabins",
  "Group Camping",
  "Day Use",
  "Boating",
];

const dynamodb = new DynamoDB(options);

exports.dynamodb = new DynamoDB();

// simple way to return a single Item by primary key.
async function getOne(pk, sk) {
  logger.debug(`getItem: { pk: ${pk}, sk: ${sk} }`);
  const params = {
    TableName: TABLE_NAME,
    Key: marshall({ pk, sk }),
  };
  let item = await dynamodb.getItem(params);
  if (item?.Item) {
    return unmarshall(item.Item);
  }
  return {};
}
// TODO: set paginated to TRUE by default. Query results will then be at most 1 page
// (1MB) unless they are explicitly specified to retrieve more.
// TODO: Ensure the returned object has the same structure whether results are paginated or not.
async function runQuery(query, paginated = false) {
  logger.debug("query:", query);
  let data = [];
  let pageData = [];
  let page = 0;

  do {
    page++;
    if (pageData?.LastEvaluatedKey) {
      query.ExclusiveStartKey = pageData.LastEvaluatedKey;
    }
    pageData = await dynamodb.query(query);
    data = data.concat(
      pageData.Items.map((item) => {
        return unmarshall(item);
      })
    );
    if (page < 2) {
      logger.debug(`Page ${page} data:`, data);
    } else {
      logger.debug(
        `Page ${page} contains ${pageData.Items.length} additional query results...`
      );
    }
  } while (pageData?.LastEvaluatedKey && !paginated);

  logger.debug(
    `Query result pages: ${page}, total returned items: ${data.length}`
  );
  if (paginated) {
    return {
      LastEvaluatedKey: pageData.LastEvaluatedKey,
      data: data,
    };
  } else {
    return data;
  }
}

// TODO: set paginated to TRUE by default. Scan results will then be at most 1 page
// (1MB) unless they are explicitly specified to retrieve more.
// TODO: Ensure the returned object has the same structure whether results are paginated or not.
async function runScan(query, paginated = false) {
  logger.debug("query:", query);
  let data = [];
  let pageData = [];
  let page = 0;

  do {
    page++;
    if (pageData?.LastEvaluatedKey) {
      query.ExclusiveStartKey = pageData.LastEvaluatedKey;
    }
    pageData = await dynamodb.scan(query);
    data = data.concat(
      pageData.Items.map((item) => {
        return unmarshall(item);
      })
    );
    if (page < 2) {
      logger.debug(`Page ${page} data:`, data);
    } else {
      logger.debug(
        `Page ${page} contains ${pageData.Items.length} additional scan results...`
      );
    }
  } while (pageData?.LastEvaluatedKey && !paginated);

  logger.debug(
    `Scan result pages: ${page}, total returned items: ${data.length}`
  );
  if (paginated) {
    return {
      LastEvaluatedKey: pageData.LastEvaluatedKey,
      data: data,
    };
  } else {
    return data;
  }
}

// returns all parks in the database.
// includeLegacy = false will only return parks that are not marked as legacy.
async function getParks(includeLegacy = true) {
  const parksQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": { S: "park" },
    },
  };
  if (!includeLegacy) {
    parksQuery.FilterExpression = "isLegacy = :legacy OR attribute_not_exists(isLegacy)";
    parksQuery.ExpressionAttributeValues[":legacy"] = { BOOL: false };
  }
  return await runQuery(parksQuery);
}

async function batchPut(items) {
  await batchWrite(items, 'put');
}

async function batchWrite(items, action = 'put') {
  for (let i = 0; i < items.length; i += MAX_TRANSACTION_SIZE) {
    const chunk = items.slice(i, i + MAX_TRANSACTION_SIZE);
    const batchChunk = { RequestItems: { [TABLE_NAME]: [] } };
    for (const item of chunk) {
      if (action === 'put') {
        batchChunk.RequestItems[TABLE_NAME].push({
          PutRequest: {
            Item: marshall(item, {removeUndefinedValues: true })
          }
        });
      }
      if (action === 'delete') {
        batchChunk.RequestItems[TABLE_NAME].push({
          DeleteRequest: {
            Key: {
              pk: { S: item.pk },
              sk: { S: item.sk }
            }
          }
        });
      }
    } try {

      await dynamodb.batchWriteItem(batchChunk);
    } catch (err) {
      for (const item of items) {
        logger.info('item.fields:', item.fields);
      }
      logger.error('err:', err);
    }
  }
}

// returns all subareas within an ORCS.
// includeLegacy = false will only return subareas that are not marked as legacy.
async function getSubAreas(orcs, includeLegacy = true) {
  const subAreaQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": { S: `park::${orcs}` },
    },
  };
  if (!includeLegacy) {
    subAreaQuery.FilterExpression = "isLegacy = :legacy OR attribute_not_exists(isLegacy)";
    subAreaQuery.ExpressionAttributeValues[":legacy"] = { BOOL: false };
  }
  return await runQuery(subAreaQuery);
}

// returns all records within a subarea.
// pass the full subarea object.
// pass filter = false to look for every possible activity
// includeLegacy = false will only return records that are not marked as legacy.
async function getRecords(subArea, bundle, section, region, filter = true, includeLegacy = true) {
  let records = [];
  let filteredActivityList = RECORD_ACTIVITY_LIST;
  if (filter && subArea.activities) {
    filteredActivityList = Array.from(subArea.activities);
  }
  for (let activity of filteredActivityList) {
    const recordQuery = {
      TableName: TABLE_NAME,
      KeyConditionExpression: `pk = :pk`,
      ExpressionAttributeValues: {
        ":pk": { S: `${subArea.sk}::${activity}` },
      },
    };
    if (!includeLegacy) {
      recordQuery.FilterExpression = "isLegacy = :legacy OR attribute_not_exists(isLegacy)";
      recordQuery.ExpressionAttributeValues[":legacy"] = { BOOL: false };
    }
    let recordsFromQuery = await runQuery(recordQuery);
    for (let rec of recordsFromQuery) {
      // Tack these items from the subArea record onto the report record as they are not found on the
      // activity entry
      rec.bundle = bundle;
      rec.section = section;
      rec.region = region;
      records = records.concat(rec);
    }
  }
  return records;
}

async function incrementAndGetNextSubAreaID() {
  const configUpdateObj = {
    TableName: CONFIG_TABLE_NAME,
    Key: {
      pk: { S: "subAreaID" },
    },
    UpdateExpression: "ADD lastID :incrVal",
    ExpressionAttributeValues: {
      ":incrVal": { N: "1" },
    },
    ReturnValues: "UPDATED_NEW",
  };
  const response = await dynamodb.updateItem(configUpdateObj);
  return response?.Attributes?.lastID?.N;
}

module.exports = {
  logger,
  sendResponse,
  calculateVariance,
  ACTIVE_STATUS,
  RESERVED_STATUS,
  EXPIRED_STATUS,
  PASS_TYPE_AM,
  PASS_TYPE_PM,
  PASS_TYPE_DAY,
  TIMEZONE,
  PM_ACTIVATION_HOUR,
  PASS_TYPE_EXPIRY_HOURS,
  FISCAL_YEAR_FINAL_MONTH,
  TABLE_NAME,
  ORCS_INDEX,
  NAME_CACHE_TABLE_NAME,
  dynamodb,
  runQuery,
  runScan,
  getOne,
  getParks,
  getSubAreas,
  getRecords,
  incrementAndGetNextSubAreaID,
}
