
const bucket = process.env.S3_BUCKET_DATA || "parks-ar-assets-tools";

const IS_OFFLINE =
  process.env.IS_OFFLINE && process.env.IS_OFFLINE === "true" ? true : false;

const options = {};
if (IS_OFFLINE) {
  options.region = "local";
  // For local we use port 3002 because we're hitting an invokable
  options.endpoint = "http://localhost:3002";
}

const { runQuery,
  dynamoClient,
  PutItemCommand,
  GetObjectCommand,
  getSignedUrl,
  s3Client,
  marshall,
  lambda,
  TABLE_NAME,
  sendResponse,
  logger
} = require("/opt/baseLayer");
const { convertRolesToMD5 } = require("/opt/functionsLayer");

const EXPORT_FUNCTION_NAME = process.env.EXPORT_FUNCTION_NAME || "ar-api-ExportInvokableFunction";

const EXPIRY_TIME = process.env.EXPORT_EXPIRY_TIME
  ? Number(process.env.EXPORT_EXPIRY_TIME)
  : 60 * 15; // 15 minutes

exports.handler = async (event, context) => {
  logger.debug("GET: Export", event.queryStringParameters);

  // Allow CORS
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, context);
  }
  
  try {
    let permissionObject = event.requestContext.authorizer;
    permissionObject.roles = JSON.parse(permissionObject.roles);

    if (!permissionObject.isAuthenticated) {
      return sendResponse(403, { msg: "Error: UnAuthenticated." }, context);
    }
    
    // This will give us the sk
    const sk = convertRolesToMD5(permissionObject.roles, "export-");

    // Check for existing job
    let queryObj = {
      TableName: TABLE_NAME,
      ExpressionAttributeValues: {
        ":pk": { S: "job" },
        ":sk": { S: sk },
      },
      KeyConditionExpression: "pk =:pk and sk =:sk",
    };

    const res = (await runQuery(queryObj))[0];

    if (event?.queryStringParameters?.getJob) {
      // If the getJob flag is set, that means we are trying to download the report
      if (!res) {
        // Job does not exist.
        return sendResponse(200, { status: "Job not found" }, context);
      } else if (
        res.progressState === "complete" ||
        res.progressState === "error"
      ) {
        // Job is not currently running. Return signed url
        let urlKey = res.key;
        let message = "Job complete";
        if (res.progressState === "error") {
          urlKey = res.lastSuccessfulJob.key || {};
          message = "Job failed. Returning last successful job.";
        }
        let URL = "";
        if (!IS_OFFLINE) {
          let command = new GetObjectCommand({ Bucket: bucket, Key: urlKey });
          URL = await getSignedUrl(
            s3Client,
            command,
            { expiresIn: EXPIRY_TIME });
        }
        delete res.pk;
        delete res.sk;
        delete res.key;
        return sendResponse(
          200,
          { status: message, signedURL: URL, jobObj: res },
          context
        );
      } else {
        // Send back the latest job obj.
        delete res.pk;
        delete res.sk;
        delete res.key;
        return sendResponse(
          200,
          { status: "Job in progress", jobObj: res },
          context
        );
      }
    } else {
      // We are trying to create a report.
      // If there's already a completed job, we want to save this in case the new job fails.
      let lastSuccessfulJob = {};
      if (res?.progressState === "complete" && res?.key) {
        lastSuccessfulJob = {
          key: res.key,
          dateGenerated: res.dateGenerated || new Date().toISOString(),
        };
      } else if (res?.progressState === "error") {
        lastSuccessfulJob = res.lastSuccessfulJob || {};
      }
      const putObject = {
        TableName: TABLE_NAME,
        ExpressionAttributeValues: {
          ":complete": { S: "complete" },
          ":error": { S: "error" },
        },
        ConditionExpression:
          "(attribute_not_exists(pk) AND attribute_not_exists(sk)) OR attribute_not_exists(progressState) OR progressState = :complete OR progressState = :error",
        Item: marshall({
          pk: "job",
          sk: sk,
          progressPercentage: 0,
          progressDescription: "Initializing job.",
          progressState: "initializing",
          lastSuccessfulJob: lastSuccessfulJob,
        }),
      };
      logger.debug(putObject);
      let newJob;
      try {
        newJob = await dynamoClient.send(new PutItemCommand(putObject));
        // Check if there's already a report being generated.
        // If there are is no instance of a job or the job is 100% complete, generate a report.
        logger.debug("Creating a new export job.", newJob);

        const params = {
          FunctionName: EXPORT_FUNCTION_NAME,
          InvocationType: "Event",
          LogType: "None",
          Payload: JSON.stringify({
            jobId: sk,
            roles: permissionObject.roles,
            lastSuccessfulJob: lastSuccessfulJob,
          }),
        };
        // Invoke generate report function
        await lambda.invoke(params);

        return sendResponse(200, { status: "Export job created" }, context);
      } catch (error) {
        // A job already exists.
        logger.error(error);
        return sendResponse(200, { status: "Job is already running" }, context);
      }
    }
  } catch (error) {
    logger.error(error);
    return sendResponse(400, { error: error }, context);
  }
};
