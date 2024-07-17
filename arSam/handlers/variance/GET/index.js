const { runQuery, TABLE_NAME, sendResponse, logger } = require("/opt/baseLayer");
const { roleFilter } = require("/opt/permissionLayer");

exports.handler = async (event, context) => {
  logger.debug("Variance get:", event);

  // Allow CORS
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, context);
  }

  try {
    const permissionObject = event.requestContext.authorizer;
    permissionObject.roles = JSON.parse(permissionObject.roles);

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
    // TODO: find a better way to send ExclusiveStartKeys without sending pk/sk individually (queryParams cant handle objects)
    const lastEvaluatedKeyPK = event.queryStringParameters.lastEvaluatedKeyPK;
    const lastEvaluatedKeySK = event.queryStringParameters.lastEvaluatedKeySK;


    // Must provide park and activityDate
    if (!event.queryStringParameters
      || !orcs
      || !activityDate) {
      return sendResponse(400, { msg: "Invalid request." });
    }


    return await getVarianceRecords(permissionObject, orcs, activityDate, subAreaId, activity, resolvedStatus, lastEvaluatedKeyPK, lastEvaluatedKeySK)
  } catch (e) {
    logger.error(e);
  }

  return sendResponse(400, { msg: "Invalid request." }, context);
};

async function getVarianceRecords(permissionObject, orcs, activityDate, subAreaId, activity, resolvedStatus, lastEvaluatedKeyPK, lastEvaluatedKeySK, context) {
  let queryObj = {
    TableName: TABLE_NAME
  };

  // define pk
  queryObj.ExpressionAttributeValues = {};
  queryObj.ExpressionAttributeValues[':pk'] = { S: `variance::${orcs}::${activityDate}` };
  queryObj.KeyConditionExpression = 'pk =:pk';

  // limit role
  if (subAreaId) {
    if (!activity) {
      // if subArea is provided but no activity, search sk 'starts with: subAreaId::'
      queryObj.ExpressionAttributeValues[':sk'] = { S: `${subAreaId}::` };
      queryObj.KeyConditionExpression += ' AND begins_with(sk, :sk)';
    } else {
      // if activity is provided, search for exact sk.
      queryObj.ExpressionAttributeValues[':sk'] = { S: `${subAreaId}::${activity}` };
      queryObj.KeyConditionExpression += ' AND sk =:sk';
    }
  }

  // add filters (queryparams cant handle booleans)
  if (resolvedStatus !== undefined && resolvedStatus !== null) {
    if (resolvedStatus === "true") {
      queryObj.ExpressionAttributeValues[':resolved'] = { BOOL: true };
    } else {
      queryObj.ExpressionAttributeValues[':resolved'] = { BOOL: false };
    }
    queryObj.FilterExpression = 'resolved =:resolved';
  }

  if (lastEvaluatedKeyPK && lastEvaluatedKeySK) {
    queryObj.ExclusiveStartKey = {
      pk: { S: lastEvaluatedKeyPK },
      sk: { S: lastEvaluatedKeySK }
    };
  }

  try {
    const data = await runQuery(queryObj, true);
    // Remove data that doesn't have permission to access.
    logger.debug('User roles: ', permissionObject.roles);
    const filteredData = await roleFilter(data.data, permissionObject.roles);

    return sendResponse(200, { data: filteredData, lastEvaluatedKey: data.LastEvaluatedKey }, context);
  } catch (e) {
    logger.error(e);
    return sendResponse(400, { msg: "Invalid request." }, context);
  }
}
