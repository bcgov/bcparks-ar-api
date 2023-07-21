const { runQuery, TABLE_NAME } = require("../../dynamoUtil");
const { sendResponse } = require("../../responseUtil");
const {
  decodeJWT,
  roleFilter,
  resolvePermissions,
} = require("../../permissionUtil");
const { logger } = require("../../logger");

exports.handler = async (event, context) => {
  logger.debug("Variance get:", event);

  try {
    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);

    // Only admins see this route.
    if (permissionObject.isAdmin) {
      // Sysadmin, they get it all
      logger.info("**Sysadmin**");
    } else {
      if (permissionObject.isAuthenticated) {
        // Non-sysadmin role.
        logger.info("**Authenticated, non-sysadmin**");
      } else {
        logger.info("**Someone else**");
        return sendResponse(403, { msg: "Error: UnAuthenticated." }, context);
      }
    }

    // new pk/sk for variance:
    // pk: variance::ORCS::activityDate
    // sk: subAreaId::activity
    // filters: status
    const orcs = event.queryStringParameters.orcs;
    const subAreaId = event.queryStringParameters.subAreaId;
    const activity = event.queryStringParameters.activity;
    const activityDate = event.queryStringParameters.date;
    const resolvedStatus = event.queryStringParameters.resolved;
    const lastEvaluatedKey = event.queryStringParameters.lastEvaluatedKey;


    // Must provide park and activityDate
    if (!event.queryStringParameters
      || !orcs
      || !activityDate) {
      return sendResponse(400, { msg: "Invalid request." });
    }


    return await getVarianceRecords(permissionObject, orcs, activityDate, subAreaId, activity, resolvedStatus, lastEvaluatedKey)
  } catch (e) {
    console.error(e);
  }

  return sendResponse(400, { msg: "Invalid request." }, context);
};

async function getVarianceRecords(permissionObject, orcs, activityDate, subAreaId, activity, resolvedStatus, lastEvaluatedKey, context) {
  let queryObj = {
    TableName: TABLE_NAME
  };

  // define pk
  queryObj.ExpressionAttributeValues = {};
  queryObj.ExpressionAttributeValues[':pk'] = { S: `variance::${orcs}::${activityDate}` };
  queryObj.KeyConditionExpression = 'pk =:pk';

  if (subAreaId) {
    if (activity) {
      // if subArea is provided but no activity, search sk 'starts with: subAreaId::'
      queryObj.ExpressionAttributeValues[':sk'] = { S: `${subAreaId}::` };
      queryObj.KeyConditionExpression += ' AND begins_with(sk, :sk)';
    } else {
      // if activity is provided, search for exact sk.
      queryObj.ExpressionAttributeValues[':sk'] = { S: `${subAreaId}::${activity}` };
      queryObj.KeyConditionExpression += ' AND sk =:sk';
    }
  }

  // add filters
  
  if (resolvedStatus !== undefined) {
    queryObj.ExpressionAttributeValues[':status'] = { S: resolvedStatus };
    queryObj.FilterExpression = ' resolved =:status';
  }

  if (lastEvaluatedKey) {
    queryObj.ExclusiveStartKey = lastEvaluatedKey;
  }

  try {
    const data = await runQuery(queryObj, true);
    // Remove data that doesn't have permission to access.
    logger.debug('User roles: ', permissionObject.roles);
    const filteredData = await roleFilter(data.data, permissionObject.roles);

    return sendResponse(200, filteredData, context);
  } catch (e) {
    logger.error(e);
    return sendResponse(400, { msg: "Invalid request." }, context);
  }
}
