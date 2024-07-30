describe("keycloak utility tests", () => {
    beforeEach(async () => {
      jest.resetModules();
    });
  
    test("Creates Update Park with New Sub Area Object", async () => {
      const utils = require("../formulaLayer");
      const response = await utils.createPutFormulaConfigObj(
        ["Day Use", "Backcountry Cabins", "Fake Garbage"],
        "test-id",
        "test-park-name",
        "test-orcs",
        "test-sub-area-name"
      );
  
      expect(response).toEqual([
        {
          TableName: "ParksAr-tests",
          ConditionExpression: "attribute_not_exists(sk)",
          Item: {
            pk: { S: "config::test-id" },
            sk: { S: "Day Use" },
            parkName: { S: "test-park-name" },
            orcs: { S: "test-orcs" },
            subAreaId: { S: "test-id" },
            subAreaName: { S: "test-sub-area-name" },
            attendanceVehiclesModifier: { N: "3.5" },
            attendanceBusModifier: { N: "40" },
          },
        },
        {
          TableName: "ParksAr-tests",
          ConditionExpression: "attribute_not_exists(sk)",
          Item: {
            pk: { S: "config::test-id" },
            sk: { S: "Backcountry Cabins" },
            parkName: { S: "test-park-name" },
            orcs: { S: "test-orcs" },
            subAreaId: { S: "test-id" },
            subAreaName: { S: "test-sub-area-name" },
            attendanceModifier: { N: "3.2" },
          },
        },
      ]);
    });
  });
  