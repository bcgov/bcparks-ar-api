const { dynamoClient,
  PutItemCommand,
  TABLE_NAME,
  logger,
  sendResponse
} = require("/opt/baseLayer");

exports.handler = async (event, context) => {
  logger.debug("Park POST:", event);
  try {
    const permissionObject = event.requestContext.authorizer;
    permissionObject.roles = JSON.parse(permissionObject.roles);
    
    if (!permissionObject.isAuthenticated) {
      logger.info("**NOT AUTHENTICATED, PUBLIC**");
      return sendResponse(403, { msg: "Error: UnAuthenticated." }, context);
    }

    // Admins only
    if (!permissionObject.isAdmin) {
      logger.info("Not authorized.");
      return sendResponse(403, { msg: "Unauthorized." }, context);
    }

    const body = JSON.parse(event.body);

    if (!body.orcs || !body.parkName) {
      return sendResponse(400, { msg: "Invalid request" }, context);
    }

    const postObj = {
      TableName: TABLE_NAME,
      ConditionExpression: "attribute_not_exists(sk)",
      Item: {
        pk: { S: `park` },
        sk: { S: body.orcs },
        orcs: { S: body.orcs },
        parkName: { S: body.parkName },
        isLegacy: { BOOL: body.isLegacy ? body.isLegacy : false },
        roles: { L: [{ S: 'sysadmin' }, { S: body.orcs }] },
        subAreas: { L: [] },
      },
    };

    logger.debug("Creating park:", postObj);
    const res = await dynamoClient.send(new PutItemCommand(postObj));
    logger.info("Park Created");
    logger.debug("Result:", res);
    return sendResponse(200, res);
  } catch (err) {
    logger.error(err);
    return sendResponse(400, { msg: "Invalid request" }, context);
  }
};
