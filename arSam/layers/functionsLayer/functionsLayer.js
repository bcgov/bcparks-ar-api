const { dynamoClient, PutItemCommand, marshall } = require("/opt/baseLayer");
const { createHash } = require("node:crypto");

function convertRolesToMD5(roles, prefix = "") {
  const codedRoles = prefix + roles.join("-");
  const hash = createHash("md5").update(codedRoles).digest("hex");
  return hash;
}

// {
//     sk: String,
//     progressPercentage: Number,
//     key: String,
//     progressDescription: String
// }
// sk is an MD5 that is generated based on the user's roles.

async function updateJobEntry(jobObj, tableName) {
  jobObj.pk = "job";

  let newObject = marshall(jobObj, {removeUndefinedValues: true});
  let putObject = {
    TableName: tableName,
    Item: newObject,
  };
  await dynamoClient.send(new PutItemCommand(putObject));
}

module.exports = {
  convertRolesToMD5,
  updateJobEntry,
};
