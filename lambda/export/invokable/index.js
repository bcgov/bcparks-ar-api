const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const fs = require("fs");
const writeXlsxFile = require("write-excel-file/node");
const { runScan, runQuery, TABLE_NAME, getParks, getSubAreas, getRecords, getOne } = require("../../dynamoUtil");
const {
  EXPORT_NOTE_KEYS,
  EXPORT_MONTHS,
  CSV_SYSADMIN_SCHEMA,
  STATE_DICTIONARY,
} = require("../constants");
const { updateJobEntry } = require("../functions");
const { logger } = require('../../logger');

const {
  arraySum,
  basicNetRevenue,
  frontcountryCampingPartyAttendance,
  frontcountryCampingSecondCarAttendance,
  frontcountryCabinsPartiesAttendance,
  groupCampingStandardAttendance,
  dayUseVehicleAttendance,
  backcountryCabinsAttendance,
  boatingAttendance,
} = require("../../formulaUtils");

const FILE_PATH = process.env.FILE_PATH || "./";
const FILE_NAME = process.env.FILE_NAME || "A&R_Export";

const SYSADMIN_SCHEMA = process.env.CSV_SYSADMIN_SCHEMA
  ? JSON.parse(process.env.CSV_SYSADMIN_SCHEMA)
  : CSV_SYSADMIN_SCHEMA;

const JOB_UPDATE_MODULO = process.env.JOB_UPDATE_MODULO
  ? Number(process.env.JOB_UPDATE_MODULO)
  : 1;

const DISABLE_PROGRESS_UPDATES =
  process.env.DISABLE_PROGRESS_UPDATES &&
    process.env.DISABLE_PROGRESS_UPDATES === "true"
    ? true
    : false;

const DISABLE_HIGH_ACCURACY_PROGRESS_PERCENTAGE =
  process.env.DISABLE_HIGH_ACCURACY_PROGRESS_PERCENTAGE &&
    process.env.DISABLE_HIGH_ACCURACY_PROGRESS_PERCENTAGE === "true"
    ? true
    : false;

let JOB_ID;
let S3_KEY;
let CURRENT_PROGRESS_PERCENT = 0;

exports.handler = async (event, context) => {
  logger.debug("EXPORT", event || {});

  let queryObj = {
    TableName: TABLE_NAME,
  };

  try {
    if (event?.jobId && event?.roles) {
      JOB_ID = event.jobId;
      S3_KEY = JOB_ID + "/" + FILE_NAME + ".xlsx";
      const roles = event.roles;

      // FEATURE: If we wanted to have different exports for different users we can use the user's role and switch to different schemas accordingly.
      // For now, we are hardcoding to only have the sysadmin version of export
      let schema = SYSADMIN_SCHEMA;

      // Get reports - 0-20
      let scanResults = [];
      if (roles.includes("sysadmin")) {
        await updateJobWithState(
          STATE_DICTIONARY.FETCHING,
          "Fetching all entires for Sysadmin."
        );

        // Exporting all data
        logger.debug("=== Exporting all data ===");
        scanResults = await getAllRecords({ ...queryObj });

        await updateJobWithState(
          STATE_DICTIONARY.FETCHED,
          "Fetch complete. " + scanResults.length + " entries found."
        );
      } else {
        // TODO: Change query according to other roles.
        // 1. get their list of subarea role(s) from token
        // 2. query db filter by subarea name from list of subareas in role(s)
      }
      logger.debug(scanResults.length + " records found");

      // Combine reports that are part of the same date and subarea - 20-50
      CURRENT_PROGRESS_PERCENT = 30;
      const groupedReports = await groupBySubAreaAndDate(scanResults, 30);

      // Create sorted rows array - 50-80
      CURRENT_PROGRESS_PERCENT = 50;
      const rowsArray = await generateRowsArray(groupedReports, 30);
      logger.debug(rowsArray.length + " rows generated");

      // 80-90
      await updateJobWithState(STATE_DICTIONARY.GENERATE_REPORT);
      await writeXlsxFile(rowsArray, {
        schema,
        filePath: FILE_PATH + FILE_NAME + ".xlsx",
      });
      logger.debug("Report generated");

      // This means we are uploading to S3 - 90-100
      if (FILE_PATH === "/tmp/" && process.env.S3_BUCKET_DATA) {
        await updateJobWithState(STATE_DICTIONARY.UPLOAD_TO_S3);
        await uploadToS3();
      }
      await updateJobWithState(STATE_DICTIONARY.COMPLETE);

      // TODO: Log job into separate DB
      logger.debug("=== Export successful ===");
    }
  } catch (err) {
    logger.error(err);
  }
};

async function getAllRecords(queryObj) {
  let records = [];
  let subareas = [];
  try {
    const parks = await getParks();
    for (const park of parks) {
      const parkSubAreas = await getSubAreas(park.sk);
      subareas = subareas.concat(parkSubAreas);
    }
    for (const subarea of subareas) {
      const subAreaRecords = await getRecords(subarea, true);
      records = records.concat(subAreaRecords);
    }
    return records;
  } catch (err) {
    logger.error(err);
  }
}

async function groupBySubAreaAndDate(
  scanResults,
  allottedProgressPercent = 30
) {
  if (DISABLE_HIGH_ACCURACY_PROGRESS_PERCENTAGE) {
    await updateJobWithState(STATE_DICTIONARY.GROUP_BY_SUBAREA_AND_DATE);
  }
  let result = {};
  const increment = allottedProgressPercent / scanResults.length;
  for (let i = 0; i < scanResults.length; i++) {
    let report = scanResults[i];

    // Prepare report obj with calc fields populated
    report = await modifyReportForCSV(report);

    // Merge report with existing report obj for row in CSV
    result = await mergeReports(result, report);

    if (
      !DISABLE_HIGH_ACCURACY_PROGRESS_PERCENTAGE &&
      (i + 1) % JOB_UPDATE_MODULO === 0
    ) {
      await updateJobWithState(
        STATE_DICTIONARY.GROUP_BY_SUBAREA_AND_DATE,
        "Grouping activities by subarea and date: " +
        (i + 1) +
        " of " +
        scanResults.length,
        CURRENT_PROGRESS_PERCENT + increment
      );
    }
  }
  // Once the raw report data is collected, we can generate the columns
  // that depend on the raw data but span multiple activities. 
  await generateSummaryColumns(result);

  return result;
}

async function modifyReportForCSV(report) {
  const activity = report.pk.split("::").pop();

  // Give unique key for variance notes
  report[EXPORT_NOTE_KEYS[activity]] = report.notes;
  delete report.notes;

  // Perform calcs according to activity
  switch (activity) {
    case "Frontcountry Camping":
      // Camping Party Nights - TOTAL ATTENDANCE
      report.calc_frontCountryCamping_frontCountryCamping_campingPartyNights_totalAttendance =
        frontcountryCampingPartyAttendance(
          [
            report.campingPartyNightsAttendanceStandard,
            report.campingPartyNightsAttendanceSenior,
            report.campingPartyNightsAttendanceSocial,
            report.campingPartyNightsAttendanceLongStay,
          ],
          report.config.attendanceModifier
        ).result;

      // Camping Party Nights - NET REVENUE
      report.calc_frontCountryCamping_campingPartyNights_netRevenue =
        basicNetRevenue([report.campingPartyNightsRevenueGross]).result;

      // Second cars / additional vehicles - TOTAL ATTENDANCE
      report.calc_frontCountryCamping_secondCars_totalAttendance =
        frontcountryCampingSecondCarAttendance([
          report.secondCarsAttendanceStandard,
          report.secondCarsAttendanceSenior,
          report.secondCarsAttendanceSocial,
        ]).result;

      // Second cars / additional vehicles - NET REVENUE
      report.calc_frontCountryCamping_secondCars_netRevenue = basicNetRevenue([
        report.secondCarsRevenueGross,
      ]).result;

      // Other frontcountry / sani - NET REVENUE
      report.calc_frontCountryCamping_other_sani_netRevenue = basicNetRevenue([
        report.otherRevenueGrossSani
      ]).result;

      // Other frontcountry / electrical - NET REVENUE
      report.calc_frontCountryCamping_other_electrical_netRevenue = basicNetRevenue([
        report.otherRevenueElectrical
      ]).result;

      // Other frontcountry / shower - NET REVENUE
      report.calc_frontCountryCamping_other_shower_netRevenue = basicNetRevenue([
        report.otherRevenueShower
      ]).result;
      break;

    case "Frontcountry Cabins":
      // Parties - TOTAL ATTENDANCE
      report.calc_frontcountryCabins_parties_totalAttendance = frontcountryCabinsPartiesAttendance(
        [report.totalAttendanceParties],
        report.config.attendanceModifier
      ).result;
      // NET REVENUE
      report.calc_frontcountryCabins_camping_netRevenue = basicNetRevenue([
        report.revenueGrossCamping,
      ]).result;
      break;

    case "Group Camping":
      // Standard rate groups - TOTAL PEOPLE
      report.calc_groupCamping_standardRate_totalPeople =
        groupCampingStandardAttendance([
          report.standardRateGroupsTotalPeopleAdults,
          report.standardRateGroupsTotalPeopleYouth,
          report.standardRateGroupsTotalPeopleKids,
        ]).result;

      // Standard rate groups - NET REVENUE
      report.calc_groupCamping_standardRate_netRevenue = basicNetRevenue([
        report.standardRateGroupsRevenueGross,
      ]).result;

      // Youth rate groups - NET REVENUE
      report.calc_groupCamping_youthRate_netRevenue = basicNetRevenue([
        report.youthRateGroupsRevenueGross,
      ]).result;

      // Group Camping - TOTAL ATTENDANCE
      report.calc_groupCamping_totalPeople = arraySum([
        report.calc_groupCamping_standardRate_totalPeople,
        report.youthRateGroupsAttendancePeople
      ]) || null;

      // Group Camping - TOTAL GROSS REVENUE
      report.calc_groupCamping_totalGrossRevenue = arraySum([
        report.standardRateGroupsRevenueGross,
        report.youthRateGroupsRevenueGross
      ]) || null;

      // Group Camping - TOTAL NET REVENUE
      report.calc_groupCamping_totalNetRevenue = basicNetRevenue([
        report.calc_groupCamping_totalGrossRevenue
      ]).result;
      break;

    case "Day Use":
      // People and vehicles - VEHICLE ATTENDANCE
      report.calc_dayUse_peopleAndVehicles_vehicleAttendance =
        dayUseVehicleAttendance(
          [report.peopleAndVehiclesTrail],
          [report.peopleAndVehiclesVehicle],
          [report.peopleAndVehiclesBus],
          report.config.attendanceVehiclesModifier,
          report.config.attendanceBusModifier
        ).result;

      // Picnic Shelters - NET REVENUE
      report.calc_dayUse_picnicShelters_netRevenue = basicNetRevenue([
        report.picnicRevenueGross,
      ]).result;

      // Other day use - NET REVENUE
      report.calc_dayUse_otherDayUse_netRevenue = basicNetRevenue([
        report.otherDayUseRevenueHotSprings,
      ]).result;

      // Day Use - Total Attendance 
      report.calc_dayUse_totalAttendancePeople = arraySum([
        report.calc_dayUse_peopleAndVehicles_vehicleAttendance,
        report.picnicShelterPeople,
        report.otherDayUsePeopleHotSprings
      ]) || null;

      // Day Use - Total Gross Revenue
      report.calc_dayUse_totalGrossRevenue = arraySum([
        report.picnicRevenueGross,
        report.otherDayUseRevenueHotSprings
      ]) || null;

      // Day Use - Total Net Revenue
      report.calc_dayUse_totalNetRevenue = basicNetRevenue([
        report.calc_dayUse_totalGrossRevenue
      ]).result;
      break;

    case "Backcountry Camping":
      // NET REVENUE
      report.calc_backcountryCamping_camping_netRevenue = basicNetRevenue([
        report.grossCampingRevenue,
      ]).result;
      break;

    case "Backcountry Cabins":
      // TOTAL PEOPLE
      report.calc_backcountryCabins_totalPeople = backcountryCabinsAttendance(
        [report.peopleAdult, report.peopleChild],
        [report.peopleFamily],
        report.config.attendanceModifier
      ).result;

      // NET REVENUE
      report.calc_backcountryCabins_family_netRevenue = basicNetRevenue([
        report.revenueFamily,
      ]).result;
      break;

    case "Boating":
      // BOAT ATTENDANCE
      report.calc_boating_boats_boatAttendance = boatingAttendance(
        [
          report.boatAttendanceNightsOnDock,
          report.boatAttendanceNightsOnBouys,
          report.boatAttendanceMiscellaneous,
        ],
        report.config.attendanceModifier
      ).result;

      // NET REVENUE
      report.calc_boating_boats_netRevenue = basicNetRevenue([
        report.boatRevenueGross,
      ]).result;
      break;

    default:
      break;
  }
  return report;
}

//calculate fiscal year based on data available
function calculateFiscalYear(year, month) {
  if (month === "Jan" || month === "Feb" || month === "Mar") {
    fiscalYear = Number(year)-1;
    fiscalYear = year + "-" + fiscalYear;
  } else {
    fiscalYear = Number(year)+1;
    fiscalYear = year + "-" + fiscalYear;
  }
  return fiscalYear;
}

async function mergeReports(result, report) {
  // We can use the report.date for sorting in a later step
  const subAreaName = report.config.subAreaName;
  const key = report.date + "_" + report.parkName + "_" + subAreaName;
  if (!result[key]) {
    const queryObj = {
      TableName: TABLE_NAME,
      ExpressionAttributeValues: {
        ":pk": { S: "park::" + report.orcs },
      },
      KeyConditionExpression: "pk = :pk",
    };
    const park = (await runQuery(queryObj))[0];

    // Set up common attributes
    result[key] = {
      region: park.region,
      section: park.section,
      bundle: park.bundle,
      parkName: report.parkName,
      subAreaName: subAreaName,
      year: Number(report.date.substring(0, 4)),
      fiscalYear: calculateFiscalYear(report.date.substring(0, 4), EXPORT_MONTHS[report.date.slice(-2)]),
      month: EXPORT_MONTHS[report.date.slice(-2)],
    };
  }

  // Remove unneeded attributes
  delete report.config;
  delete report.orcs;
  delete report.pk;
  delete report.sk;
  delete report.activity;
  delete report.lastUpdated;

  result[key] = { ...result[key], ...report };
  return result;
}

async function generateSummaryColumns(table) {
  // do math and create summary columns
  for (const key of Object.keys(table)) {

    // Frontcountry Totals
    table[key].calc_frontcountry_totalAttendancePeople = arraySum([
      table[key].calc_frontCountryCamping_frontCountryCamping_campingPartyNights_totalAttendance,
      table[key].calc_frontcountryCabins_parties_totalAttendance,
      table[key].calc_groupCamping_totalPeople
    ]) || null;

    table[key].calc_frontcountry_totalGrossRevenue = arraySum([
      table[key].campingPartyNightsRevenueGross,
      table[key].secondCarsRevenueGross,
      table[key].otherRevenueGrossSani,
      table[key].otherRevenueShower,
      table[key].revenueGrossCamping,
      table[key].calc_groupCamping_totalGrossRevenue
    ]) || null;

    table[key].calc_frontcountry_totalNetRevenue = basicNetRevenue([
      table[key].calc_frontcountry_totalGrossRevenue || 0
    ]).result;

    // Backcountry Totals
    table[key].calc_backcountry_totalAttendancePeople = arraySum([
      table[key].calc_backcountryCabins_totalPeople,
      table[key].people
    ]) || null;

    table[key].calc_backcountry_totalGrossRevenue = arraySum([
      table[key].revenueFamily,
      table[key].grossCampingRevenue
    ]) || null;

    table[key].calc_backcountry_totalNetRevenue = basicNetRevenue([
      table[key].calc_backcountry_totalGrossRevenue || 0
    ]).result;

    // Overall Camping Totals
    table[key].calc_totalCampingAttendancePeople = arraySum([
      table[key].calc_frontcountry_totalAttendancePeople,
      table[key].calc_backcountry_totalAttendancePeople
    ]) || null;

    table[key].calc_totalCampingGrossRevenue = arraySum([
      table[key].calc_frontcountry_totalGrossRevenue,
      table[key].calc_backcountry_totalGrossRevenue
    ]) || null;

    table[key].calc_totalCampingNetRevenue = basicNetRevenue([table[key].calc_totalCampingGrossRevenue]).result;

    // Overall Totals
    table[key].calc_totalAttendancePeople = arraySum([
      table[key].calc_totalCampingAttendancePeople,
      table[key].calc_dayUse_totalAttendancePeople,
      table[key].calc_boating_boats_boatAttendance
    ]) || null;

    table[key].calc_totalGrossRevenue = arraySum([
      table[key].calc_totalCampingGrossRevenue,
      table[key].calc_dayUse_totalGrossRevenue,
      table[key].boatRevenueGross
    ]) || null;

    table[key].calc_totalNetRevenue = basicNetRevenue([
      table[key].calc_totalGrossRevenue
    ]).result;

  };

  return table;
}

async function generateRowsArray(groupedReports, allottedProgressPercent = 30) {
  if (DISABLE_HIGH_ACCURACY_PROGRESS_PERCENTAGE) {
    await updateJobWithState(STATE_DICTIONARY.GENERATE_ROWS);
  }

  let keys = Object.keys(groupedReports);
  keys.sort();
  const increment = allottedProgressPercent / keys.length;

  let rowsArray = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    delete groupedReports[key].date;
    rowsArray.push(groupedReports[key]);

    if (
      !DISABLE_HIGH_ACCURACY_PROGRESS_PERCENTAGE &&
      (i + 1) % JOB_UPDATE_MODULO === 0
    ) {
      await updateJobWithState(
        STATE_DICTIONARY.GENERATE_ROWS,
        "Generating rows: " + (i + 1) + " of " + keys.length,
        CURRENT_PROGRESS_PERCENT + increment
      );
    }
  }

  return rowsArray;
}

async function uploadToS3() {
  // Get file as buffer
  const buffer = fs.readFileSync(FILE_PATH + FILE_NAME + ".xlsx");

  const params = {
    Bucket: process.env.S3_BUCKET_DATA,
    Key: S3_KEY,
    Body: buffer,
  };

  await s3.putObject(params).promise();
  logger.debug("File successfully uploaded to S3");
}

async function updateJobWithState(
  state,
  messageOverride = null,
  percentageOverride = null
) {
  let jobObj = {
    sk: JOB_ID,
    progressPercentage: 0,
    key: S3_KEY,
    progressDescription: "",
  };
  if (!DISABLE_PROGRESS_UPDATES) {
    switch (state) {
      case 1:
        jobObj.progressPercentage = percentageOverride || 0;
        jobObj.progressDescription =
          messageOverride || "Fetching entries from Database.";
        break;
      case 2:
        jobObj.progressPercentage = percentageOverride || 20;
        jobObj.progressDescription = messageOverride || "Fetch complete.";
        break;
      case 3:
        jobObj.progressPercentage = percentageOverride || 35;
        jobObj.progressDescription =
          messageOverride || "Grouping activities by subarea and date.";
        break;
      case 4:
        jobObj.progressPercentage = percentageOverride || 65;
        jobObj.progressDescription =
          messageOverride || "Generating rows for report.";
        break;
      case 5:
        jobObj.progressPercentage = 80;
        jobObj.progressDescription = "Generating report.";
        break;
      case 6:
        jobObj.progressPercentage = 90;
        jobObj.progressDescription = "Uploading document to S3.";
        break;
      case 7:
        jobObj.progressPercentage = 100;
        jobObj.progressDescription = "Job Complete. Your document is ready.";
        jobObj.dateGenerated = new Date().toISOString();
      default:
        break;
    }
    await updateJobEntry(jobObj, TABLE_NAME);
  } else if (state === 7) {
    jobObj.progressPercentage = 100;
    jobObj.progressDescription = "Job Complete. Your document is ready.";
    jobObj.dateGenerated = new Date().toISOString();
    await updateJobEntry(jobObj, TABLE_NAME);
  }
  CURRENT_PROGRESS_PERCENT = jobObj.progressPercentage;
}
