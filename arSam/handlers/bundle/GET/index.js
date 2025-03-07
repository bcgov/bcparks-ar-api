const { runQuery, TABLE_NAME, sendResponse, logger } = require("/opt/baseLayer");

exports.handler = async (event, context) => {
  logger.info("GET: Bundle");

  // Allow CORS
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, context);
  }

  try {
    let permissionObject = event?.requestContext?.authorizer;
    permissionObject.roles = JSON.parse(permissionObject?.roles);
    permissionObject.isAdmin = JSON.parse(permissionObject?.isAdmin || false);
    permissionObject.isAuthenticated = JSON.parse(permissionObject?.isAuthenticated || false);

    if (!permissionObject.isAuthenticated) {
      logger.info("**NOT AUTHENTICATED, PUBLIC**");
      return sendResponse(403, { msg: "Error: UnAuthenticated." }, context);
    }

    let response = {};

    // Get all bundles
    let bundleQuery = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: "bundle" },
      },
    };

    let bundleData = await runQuery(bundleQuery, true);
    response = bundleData.data;

    return sendResponse(200, response, context);

  } catch (error) {
    logger.error("GET: Bundle", error);
    return sendResponse(500, { msg: "Error: Internal Server Error." }, context);
  }
}
