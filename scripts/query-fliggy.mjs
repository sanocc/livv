// Explicit research query only; never imports POAI API/D1 or writes observations.
import { searchFliggy } from "../platforms/fliggy/index.js";
const args = process.argv.slice(2);
if (args.length !== 4) {
  console.error(
    "Usage: node scripts/query-fliggy.mjs CITY CHECKIN CHECKOUT KEYWORD (empty keyword allowed)",
  );
  process.exitCode = 2;
} else {
  try {
    const observation = await searchFliggy(
      {
        platform: "fliggy",
        city: args[0],
        checkin: args[1],
        checkout: args[2],
        keyword: args[3],
      },
      { apiKey: process.env.FLYAI_API_KEY },
    );
    console.log(
      JSON.stringify(
        {
          status: "EXPERIMENTAL_RESPONSE_NOT_PRODUCTION_VERIFIED",
          observation,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    // Safe codes only; never expose upstream response, transport exceptions or credentials.
    console.error(
      JSON.stringify({
        status: "BLOCKED",
        code: error.code || "EXPERIMENT_FAILED",
      }),
    );
    process.exitCode = 1;
  }
}
