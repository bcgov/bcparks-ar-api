const AWS = require("aws-sdk");
const s3 = new AWS.S3();

const IS_OFFLINE =
  process.env.IS_OFFLINE && process.env.IS_OFFLINE === "true" ? true : false;

const options = {};
if (IS_OFFLINE) {
  options.region = "local-env";
  // For local we use port 3002 because we're hitting an invokable
  options.endpoint = "http://localhost:3002";
}

const lambda = new AWS.Lambda(options);

const { logger } = require("../../logger");
const { decodeJWT, resolvePermissions } = require("../../permissionUtil");
const { sendResponse } = require("../../responseUtil");
const { TABLE_NAME, dynamodb } = require("../../dynamoUtil");
const crypto = require('crypto');

const EXPORT_FUNCTION_NAME =
  process.env.EXPORT_FUNCTION_NAME || "bcparks-ar-api-api-varianceExportInvokable";

const EXPIRY_TIME = process.env.EXPORT_EXPIRY_TIME
  ? Number(process.env.EXPORT_EXPIRY_TIME)
  : 60 * 15; // 15 minutes

exports.handler = async (event, context) => {
  logger.info("GET: Export variances - ", event?.queryStringParameters);

  // decode permissions
  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  if (!permissionObject.isAuthenticated) {
    return sendResponse(403, { msg: "Error: Not authenticated" }, context);
  }

  let params = event?.queryStringParameters || {};
  params['roles'] = permissionObject.roles;

  // generate a job id from params+role
  let hashParams = {...params};
  delete hashParams.getJob;
  const decodedHash = JSON.stringify(hashParams) + JSON.stringify(permissionObject.roles);
  const hash = crypto.createHash('md5').update(decodedHash).digest('hex');
  const pk = "variance-exp-job";

  // check for existing job
  let existingJobQueryObj = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
      ":pk": { S: pk },
      ":sk": { S: hash }
    },
    KeyConditionExpression: "pk = :pk and sk = :sk"
  }

  let jobObj = {};

  try {
    const res = await dynamodb.query(existingJobQueryObj).promise();
    jobObj = AWS.DynamoDB.Converter.unmarshall(res?.Items?.[0]) || null;
  } catch (error) {
    logger.error("Error querying for existing job: ", error);
    return sendResponse(500, { msg: "Error querying for existing job" }, context);
  }

  if (params?.getJob) {
    // We're trying to download an existing job
    if (!jobObj?.sk) {
      // Job doesn't exist.
      return sendResponse(200, { msg: "Requested job does not exist" }, context);
    } else if (
      jobObj.progressState === "complete" ||
      jobObj.progressState === "error"
    ) {
      // Job is not currently running. Return signed URL
      try {

        let urlKey = jobObj?.key;
        let message = 'Job completed';
        if (jobObj.progressState === 'error') {
          key = jobObj?.lastSuccessfulJob.key;
          message = 'Job failed. Returning last successful job.';
        }
        let URL = "";
        if (!process.env.IS_OFFLINE) {
          URL = await s3.getSignedUrl("getObject", {
            Bucket: process.env.S3_BUCKET_DATA,
            Expires: EXPIRY_TIME,
            Key: urlKey,
          });
        }
        // send back new job object
        delete jobObj.pk;
        delete jobObj.sk;
        delete jobObj.key;
        return sendResponse(200, { msg: message, signedURL: URL, jobObj: jobObj }, context);
      } catch (error) {
        logger.error("Error getting signed URL: ", error);
        return sendResponse(500, { msg: "Error getting signed URL" }, context);
      }

    } else {
      // Job is currently running. Return latest job object
      delete jobObj.pk;
      delete jobObj.sk;
      delete jobObj.key;
      return sendResponse(200, { msg: "Job is currently running", jobObj: jobObj }, context);
    }
  } else {
    // We are trying to generate a new report
    // If there's already a completed job, we want to save this in case the new job fails
    let lastSuccessfulJob = null;
    if (jobObj && jobObj?.progressState === "complete" && jobObj?.key) {
      lastSuccessfulJob = {
        key: jobObj?.key,
        dateGenerated: jobObj?.dateGenerated || new Date().toISOString(),
      }
    } else if (jobObj?.progressState === "error") {
      lastSuccessfulJob = jobObj?.lastSuccessfulJob || {};
    }

    try {
      // create the new job object
      const varianceExportPutObj = {
        TableName: TABLE_NAME,
        ExpressionAttributeValues: {
          ":complete": { S: "complete" },
          ":error": { S: "error" },
        },
        ConditionExpression: "(attribute_not_exists(pk) AND attribute_not_exists(sk)) OR attribute_not_exists(progressState) OR progressState = :complete OR progressState = :error",
        Item: AWS.DynamoDB.Converter.marshall({
          pk: pk,
          sk: hash,
          params: params,
          progressPercentage: 0,
          progressDescription: "Initializing job.",
          progressState: "Initializing",
          lastSuccessfulJob: lastSuccessfulJob || null
        }),
      };

      logger.debug('Creating new job:', varianceExportPutObj);

      const newJob = await dynamodb.putItem(varianceExportPutObj).promise();
      logger.debug('New job created:', newJob);

      // run the export function
      const varianceExportParams = {
        FunctionName: EXPORT_FUNCTION_NAME,
        InvocationType: "Event",
        LogType: "None",
        Payload: JSON.stringify({
          jobId: hash,
          params: params,
          lastSuccessfulJob: lastSuccessfulJob
        })
      }

      // Invoke the variance report export lambda
      await lambda.invoke(varianceExportParams).promise();

      return sendResponse(200, { msg: "Variance report export job created" }, context);
    } catch (error) {
      // a job already exists
      logger.error("Error creating new job:", error);
      return sendResponse(200, { msg: "Variance report export job already running" }, context);

    }
  }
}

