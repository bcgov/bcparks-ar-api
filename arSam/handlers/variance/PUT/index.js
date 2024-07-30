const { dynamoClient, UpdateItemCommand, TABLE_NAME, logger, sendResponse } = require("/opt/baseLayer");

exports.handler = async (event, context) => {
  logger.debug("Variance PUT:", event);

  try {
    const permissionObject = event.requestContext.authorizer;
    permissionObject.roles = JSON.parse(permissionObject.roles);
       
    if (!permissionObject.isAuthenticated) {
      logger.info("**NOT AUTHENTICATED, PUBLIC**");
      return sendResponse(403, { msg: "Error: Unauthenticated." }, context);
    }

    const body = JSON.parse(event.body);

    if (!permissionObject.isAdmin && !permissionObject.roles.includes(`${body.orcs}:${body.subAreaId}`)) {
      logger.info("Not authorized.");
      return sendResponse(403, { msg: "Unauthorized." }, context);
    }

    if (!body.subAreaId || !body.activity || !body.date || !body.orcs) {
      return sendResponse(400, { msg: "Invalid request" }, context);
    }

    let params = {
      TableName: TABLE_NAME,
      ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
      Key: {
        pk: { S: `variance::${body.orcs}::${body.date}` },
        sk: { S: `${body.subAreaId}::${body.activity}` }
      },
      ExpressionAttributeValues: {
        ':roles': { L: [{ S: "sysadmin" }, { S: `${body.orcs}:${body.subAreaId}` }] }
      },
      ExpressionAttributeNames: {
        '#roles': 'roles'
      }
    };

    let updateExpressions = ['#roles =:roles'];

    if (body.notes) {
      params.ExpressionAttributeValues[':notes'] = { S: body.notes };
      updateExpressions.push('notes = :notes');
    }

    // only sysadmins can change resolved status
    if (body.resolved !== undefined && permissionObject.isAdmin) {
      params.ExpressionAttributeValues[':resolved'] = { BOOL: body.resolved };
      updateExpressions.push('resolved = :resolved');
    }

    if (body.fields) {
      params.ExpressionAttributeValues[':fields'] = { L: body.fields.map(item => ({ S: item })) };
      updateExpressions.push('#fields = :fields');
      params.ExpressionAttributeNames['#fields'] = 'fields';
    }

    if (body.bundle) {
      params.ExpressionAttributeValues[':bundle'] = { S: body.bundle };
      updateExpressions.push('bundle = :bundle');
    }

    if (updateExpressions.length > 0) {
      params.UpdateExpression = `SET ${updateExpressions.join(', ')}`;
    }

    const res = await dynamoClient.send(new UpdateItemCommand(params));
    logger.info("Variance updated");
    logger.debug("Result:", res);
    return sendResponse(200, res);
  } catch (err) {
    logger.error(err);
    return sendResponse(400, { msg: "Invalid request" }, context);
  }
};
