const { getOne, TABLE_NAME, runQuery, sendResponse, logger } = require("/opt/baseLayer");

exports.handler = async (event, context) => {
  logger.debug("GET: dateConfig", event);

  // Allow CORS
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, 'Success', null, context);
  }
  
  try {
    const year = getDate(event);
    let res;
    if (!year) {
      res = await getAllFiscalYears();
    } else {
      res = await getFiscalYear(year);
    }
    return sendResponse(200, res);
  } catch (err) {
    logger.error(err);
    return sendResponse(err.code ?? 1, { msg: err.msg ?? err }, context);
  }
};

function getDate(event) {
  if (!event?.queryStringParameters?.fiscalYearEnd) {
    return null;
  }
  return event.queryStringParameters.fiscalYearEnd;
}

async function getFiscalYear(year) {
  // check db for fiscalYearEnd object
  try {
    const fiscalYearEnd = await getOne("fiscalYearEnd", year);
    logger.debug("fiscalYearEnd object:", fiscalYearEnd);
    return fiscalYearEnd;
  } catch (err) {
    throw {
      code: 400,
      msg: err,
    };
  }
}

async function getAllFiscalYears() {
  // return all fiscalYearEnds in db
  let queryObj = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
      ":pk": { S: "fiscalYearEnd" },
    },
    KeyConditionExpression: "pk = :pk",
  };
  try {
    const allFiscalYears = await runQuery(queryObj);
    logger.debug("fiscalYearEnd objects:", allFiscalYears);
    return allFiscalYears;
  } catch (err) {
    throw {
      code: 400,
      msg: err,
    };
  }
}
