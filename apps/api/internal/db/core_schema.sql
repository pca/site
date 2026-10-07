CREATE TABLE IF NOT EXISTS "wca_continent" ("id" varchar(50) NOT NULL PRIMARY KEY, "name" varchar(50) NOT NULL, "record_name" varchar(3) NULL, "latitude" integer NULL, "longitude" integer NULL, "zoom" integer NULL);

CREATE TABLE IF NOT EXISTS "wca_country" ("id" varchar(50) NOT NULL PRIMARY KEY, "name" varchar(50) NOT NULL, "iso2" varchar(2) NULL, "continent_id" varchar(50) NULL REFERENCES "wca_continent" ("id") DEFERRABLE INITIALLY DEFERRED);
CREATE INDEX IF NOT EXISTS "wca_country_continent_id_c502adb9" ON "wca_country" ("continent_id");

CREATE TABLE IF NOT EXISTS "wca_event" ("id" varchar(6) NOT NULL PRIMARY KEY, "name" varchar(54) NOT NULL, "rank" integer NOT NULL, "format" varchar(10) NOT NULL, "cell_name" varchar(45) NOT NULL);

CREATE TABLE IF NOT EXISTS "wca_format" ("id" varchar(1) NOT NULL PRIMARY KEY, "name" varchar(50) NOT NULL, "sort_by" varchar(255) NOT NULL, "sort_by_second" varchar(255) NOT NULL, "expected_solve_count" integer NOT NULL, "trim_fastest_n" integer NOT NULL, "trim_slowest_n" integer NOT NULL);

CREATE TABLE IF NOT EXISTS "wca_roundtype" ("id" varchar(1) NOT NULL PRIMARY KEY, "rank" integer NOT NULL, "name" varchar(50) NOT NULL, "cell_name" varchar(45) NOT NULL, "final" integer NOT NULL);

CREATE TABLE IF NOT EXISTS "wca_competition" ("id" varchar(32) NOT NULL PRIMARY KEY, "name" varchar(50) NOT NULL, "city_name" varchar(50) NOT NULL, "information" text NULL, "year" smallint unsigned NOT NULL CHECK ("year" >= 0), "month" smallint unsigned NOT NULL CHECK ("month" >= 0), "day" smallint unsigned NOT NULL CHECK ("day" >= 0), "end_month" smallint unsigned NOT NULL CHECK ("end_month" >= 0), "end_day" smallint unsigned NOT NULL CHECK ("end_day" >= 0), "event_specs" varchar(256) NULL, "wca_delegate" text NULL, "organizer" text NULL, "venue" varchar(240) NULL, "venue_address" varchar(120) NULL, "venue_details" varchar(120) NULL, "external_website" varchar(200) NULL, "cell_name" varchar(45) NOT NULL, "latitude" integer NULL, "longitude" integer NULL, "start_date" date NULL, "end_date" date NULL, "country_id" varchar(50) NULL REFERENCES "wca_country" ("id") DEFERRABLE INITIALLY DEFERRED);
CREATE INDEX IF NOT EXISTS "wca_competition_country_id_7b544c5b" ON "wca_competition" ("country_id");

CREATE TABLE IF NOT EXISTS "wca_person" ("id" varchar(10) NOT NULL PRIMARY KEY, "subid" integer NOT NULL, "name" varchar(80) NULL, "country_id" varchar(50) NULL REFERENCES "wca_country" ("id") DEFERRABLE INITIALLY DEFERRED, "gender" varchar(1) NULL);
CREATE INDEX IF NOT EXISTS "wca_person_country_id_1b816fb0" ON "wca_person" ("country_id");
CREATE UNIQUE INDEX IF NOT EXISTS "wca_person_id_subid_c242dba3_uniq" ON "wca_person" ("id", "subid");

CREATE TABLE IF NOT EXISTS "wca_ranksaverage" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "best" integer NULL, "world_rank" integer NOT NULL, "continent_rank" integer NOT NULL, "country_rank" integer NOT NULL, "event_id" varchar(6) NULL REFERENCES "wca_event" ("id") DEFERRABLE INITIALLY DEFERRED, "person_id" varchar(10) NULL REFERENCES "wca_person" ("id") DEFERRABLE INITIALLY DEFERRED);
CREATE INDEX IF NOT EXISTS "wca_rankavg_event_rank_idx" ON "wca_ranksaverage" ("event_id", "country_rank", "person_id");
CREATE INDEX IF NOT EXISTS "wca_ranksaverage_event_id_c9060a83" ON "wca_ranksaverage" ("event_id");
CREATE INDEX IF NOT EXISTS "wca_ranksaverage_person_id_c3400a10" ON "wca_ranksaverage" ("person_id");

CREATE TABLE IF NOT EXISTS "wca_rankssingle" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "best" integer NULL, "world_rank" integer NOT NULL, "continent_rank" integer NOT NULL, "country_rank" integer NOT NULL, "event_id" varchar(6) NULL REFERENCES "wca_event" ("id") DEFERRABLE INITIALLY DEFERRED, "person_id" varchar(10) NULL REFERENCES "wca_person" ("id") DEFERRABLE INITIALLY DEFERRED);
CREATE INDEX IF NOT EXISTS "wca_ranksingle_event_rank_idx" ON "wca_rankssingle" ("event_id", "country_rank", "person_id");
CREATE INDEX IF NOT EXISTS "wca_rankssingle_event_id_8bc72491" ON "wca_rankssingle" ("event_id");
CREATE INDEX IF NOT EXISTS "wca_rankssingle_person_id_72782bd6" ON "wca_rankssingle" ("person_id");

CREATE TABLE IF NOT EXISTS "wca_result" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "pos" smallint NOT NULL, "best" integer NOT NULL, "average" integer NOT NULL, "person_name" varchar(80) NULL, "value1" integer NOT NULL, "value2" integer NOT NULL, "value3" integer NOT NULL, "value4" integer NOT NULL, "value5" integer NOT NULL, "regional_single_record" varchar(3) NULL, "regional_average_record" varchar(3) NULL, "competition_id" varchar(32) NULL REFERENCES "wca_competition" ("id") DEFERRABLE INITIALLY DEFERRED, "country_id" varchar(50) NULL REFERENCES "wca_country" ("id") DEFERRABLE INITIALLY DEFERRED, "event_id" varchar(6) NULL REFERENCES "wca_event" ("id") DEFERRABLE INITIALLY DEFERRED, "format_id" varchar(1) NULL REFERENCES "wca_format" ("id") DEFERRABLE INITIALLY DEFERRED, "person_id" varchar(10) NULL REFERENCES "wca_person" ("id") DEFERRABLE INITIALLY DEFERRED, "round_type_id" varchar(1) NULL REFERENCES "wca_roundtype" ("id") DEFERRABLE INITIALLY DEFERRED, "wca_result_id" bigint unsigned NULL UNIQUE CHECK ("wca_result_id" >= 0));
CREATE INDEX IF NOT EXISTS "wca_res_evt_ctry_avg_person" ON "wca_result" ("event_id", "country_id", "average", "person_id");
CREATE INDEX IF NOT EXISTS "wca_res_evt_ctry_best_person" ON "wca_result" ("event_id", "country_id", "best", "person_id");
CREATE INDEX IF NOT EXISTS "wca_res_person_evt_avg_idx" ON "wca_result" ("person_id", "event_id", "country_id", "average", "id");
CREATE INDEX IF NOT EXISTS "wca_res_person_evt_best_idx" ON "wca_result" ("person_id", "event_id", "country_id", "best", "id");
CREATE INDEX IF NOT EXISTS "wca_result_average_c2476fa9" ON "wca_result" ("average");
CREATE INDEX IF NOT EXISTS "wca_result_best_9a0d7887" ON "wca_result" ("best");
CREATE INDEX IF NOT EXISTS "wca_result_comp_event_person" ON "wca_result" ("competition_id", "event_id", "person_id");
CREATE INDEX IF NOT EXISTS "wca_result_competition_id_fe8987d8" ON "wca_result" ("competition_id");
CREATE INDEX IF NOT EXISTS "wca_result_country_id_74bd1e43" ON "wca_result" ("country_id");
CREATE INDEX IF NOT EXISTS "wca_result_event_id_594acdde" ON "wca_result" ("event_id");
CREATE INDEX IF NOT EXISTS "wca_result_format_id_7a8d0120" ON "wca_result" ("format_id");
CREATE INDEX IF NOT EXISTS "wca_result_person_comp_idx" ON "wca_result" ("person_id", "competition_id");
CREATE INDEX IF NOT EXISTS "wca_result_person_id_11020f3a" ON "wca_result" ("person_id");
CREATE INDEX IF NOT EXISTS "wca_result_round_type_id_6da6dbe4" ON "wca_result" ("round_type_id");

CREATE TABLE IF NOT EXISTS "wca_scramble" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "scramble_id" integer unsigned NOT NULL CHECK ("scramble_id" >= 0), "group_id" varchar(3) NOT NULL, "is_extra" integer NOT NULL, "scramble_num" integer NOT NULL, "scramble" text NOT NULL, "competition_id" varchar(32) NULL REFERENCES "wca_competition" ("id") DEFERRABLE INITIALLY DEFERRED, "event_id" varchar(6) NULL REFERENCES "wca_event" ("id") DEFERRABLE INITIALLY DEFERRED, "round_type_id" varchar(1) NULL REFERENCES "wca_roundtype" ("id") DEFERRABLE INITIALLY DEFERRED);
CREATE INDEX IF NOT EXISTS "wca_scramble_competition_id_21afadea" ON "wca_scramble" ("competition_id");
CREATE INDEX IF NOT EXISTS "wca_scramble_event_id_5b96cc2d" ON "wca_scramble" ("event_id");
CREATE INDEX IF NOT EXISTS "wca_scramble_round_type_id_825f6e91" ON "wca_scramble" ("round_type_id");

CREATE TABLE IF NOT EXISTS "wca_championship" ("id" integer NOT NULL PRIMARY KEY, "championship_type" varchar(191) NOT NULL, "competition_id" varchar(32) NULL REFERENCES "wca_competition" ("id") DEFERRABLE INITIALLY DEFERRED);
CREATE INDEX IF NOT EXISTS "wca_championship_competition_id_16e257d3" ON "wca_championship" ("competition_id");

CREATE TABLE IF NOT EXISTS "wca_boundarydataset" ("version" varchar(80) NOT NULL PRIMARY KEY, "source_url" varchar(500) NOT NULL, "retrieved_on" date NOT NULL, "coordinate_system" varchar(32) NOT NULL, "license" varchar(240) NOT NULL, "attribution" varchar(500) NOT NULL, "processing_notes" text NOT NULL, "checksum_sha256" varchar(64) NOT NULL, "feature_count" smallint unsigned NOT NULL CHECK ("feature_count" >= 0), "created_at" datetime NOT NULL);
CREATE INDEX IF NOT EXISTS "wca_boundarydataset_checksum_sha256_a267f56e" ON "wca_boundarydataset" ("checksum_sha256");

CREATE TABLE IF NOT EXISTS "wca_competitionregionassignment" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "region_code" varchar(2) NULL, "status" varchar(32) NOT NULL, "classified_latitude" integer NULL, "classified_longitude" integer NULL, "classified_at" datetime NOT NULL, "boundary_dataset_id" varchar(80) NOT NULL REFERENCES "wca_boundarydataset" ("version") DEFERRABLE INITIALLY DEFERRED, "competition_id" varchar(32) NOT NULL UNIQUE REFERENCES "wca_competition" ("id") DEFERRABLE INITIALLY DEFERRED);
CREATE INDEX IF NOT EXISTS "wca_assign_dataset_region_idx" ON "wca_competitionregionassignment" ("boundary_dataset_id", "region_code");
CREATE INDEX IF NOT EXISTS "wca_assign_dataset_status_idx" ON "wca_competitionregionassignment" ("boundary_dataset_id", "status");
CREATE INDEX IF NOT EXISTS "wca_competitionregionassignment_boundary_dataset_id_78fe204d" ON "wca_competitionregionassignment" ("boundary_dataset_id");
CREATE INDEX IF NOT EXISTS "wca_competitionregionassignment_region_code_4538b8ff" ON "wca_competitionregionassignment" ("region_code");
CREATE INDEX IF NOT EXISTS "wca_competitionregionassignment_status_52ce8feb" ON "wca_competitionregionassignment" ("status");

CREATE TABLE IF NOT EXISTS "api_user" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "password" varchar(128) NOT NULL, "last_login" datetime NULL, "is_superuser" bool NOT NULL, "username" varchar(150) NOT NULL UNIQUE, "first_name" varchar(150) NOT NULL, "last_name" varchar(150) NOT NULL, "email" varchar(254) NOT NULL, "is_staff" bool NOT NULL, "is_active" bool NOT NULL, "date_joined" datetime NOT NULL, "wca_id" varchar(64) NULL, "region_updated_at" datetime NULL, "created_at" datetime NOT NULL, "updated_at" datetime NOT NULL, "region" varchar(255) NULL);
CREATE INDEX IF NOT EXISTS "api_user_wca_id_25930cfc" ON "api_user" ("wca_id");

CREATE TABLE IF NOT EXISTS "api_regionupdaterequest" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "status" varchar(8) NOT NULL, "created_at" datetime NOT NULL, "updated_at" datetime NOT NULL, "user_id" integer NOT NULL REFERENCES "api_user" ("id") DEFERRABLE INITIALLY DEFERRED, "staff_notes" text NOT NULL, "region" varchar(64) NOT NULL);
CREATE INDEX IF NOT EXISTS "api_regionupdaterequest_created_at_58a7b55d" ON "api_regionupdaterequest" ("created_at");
CREATE INDEX IF NOT EXISTS "api_regionupdaterequest_user_id_5e8d82a2" ON "api_regionupdaterequest" ("user_id");

CREATE TABLE IF NOT EXISTS "api_statisticssnapshot" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "export_version" varchar(120) NOT NULL, "export_checksum" varchar(64) NOT NULL, "latest_year" smallint unsigned NOT NULL CHECK ("latest_year" >= 0), "status" varchar(16) NOT NULL, "is_active" bool NOT NULL, "coverage" text NOT NULL CHECK ((JSON_VALID("coverage") OR "coverage" IS NULL)), "error_message" text NOT NULL, "created_at" datetime NOT NULL, "completed_at" datetime NULL, "activated_at" datetime NULL, "boundary_dataset_id" varchar(80) NOT NULL REFERENCES "wca_boundarydataset" ("version") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "api_stats_snapshot_input_uniq" UNIQUE ("export_checksum", "boundary_dataset_id"));
CREATE UNIQUE INDEX IF NOT EXISTS "api_one_active_stats_snapshot" ON "api_statisticssnapshot" ("is_active") WHERE "is_active";
CREATE INDEX IF NOT EXISTS "api_statisticssnapshot_boundary_dataset_id_2a8fcae2" ON "api_statisticssnapshot" ("boundary_dataset_id");
CREATE INDEX IF NOT EXISTS "api_statisticssnapshot_is_active_2f259502" ON "api_statisticssnapshot" ("is_active");

CREATE TABLE IF NOT EXISTS "api_regionalstrengthrecord" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "rank_type" varchar(8) NOT NULL, "region_code" varchar(5) NOT NULL, "score" integer unsigned NOT NULL CHECK ("score" >= 0), "placement" smallint unsigned NOT NULL CHECK ("placement" >= 0), "contributor_count" smallint unsigned NOT NULL CHECK ("contributor_count" >= 0), "slots" text NOT NULL CHECK ((JSON_VALID("slots") OR "slots" IS NULL)), "content_hash" varchar(64) NOT NULL, "event_id" varchar(6) NOT NULL REFERENCES "wca_event" ("id") DEFERRABLE INITIALLY DEFERRED, "snapshot_id" integer NOT NULL REFERENCES "api_statisticssnapshot" ("id") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "api_regional_strength_row_uniq" UNIQUE ("snapshot_id", "event_id", "rank_type", "region_code"));
CREATE INDEX IF NOT EXISTS "api_regionalstrengthrecord_event_id_c6116d60" ON "api_regionalstrengthrecord" ("event_id");
CREATE INDEX IF NOT EXISTS "api_regionalstrengthrecord_snapshot_id_fae92f43" ON "api_regionalstrengthrecord" ("snapshot_id");
CREATE INDEX IF NOT EXISTS "api_strength_event_lookup_idx" ON "api_regionalstrengthrecord" ("snapshot_id", "event_id", "rank_type", "placement");
CREATE INDEX IF NOT EXISTS "api_strength_region_lookup_idx" ON "api_regionalstrengthrecord" ("snapshot_id", "region_code", "rank_type", "placement");

CREATE TABLE IF NOT EXISTS "api_growthannualrecord" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "metric" varchar(24) NOT NULL, "year" smallint unsigned NOT NULL CHECK ("year" >= 0), "region_code" varchar(5) NOT NULL, "event_id" varchar(6) NOT NULL, "value" integer unsigned NOT NULL CHECK ("value" >= 0), "unique_competitors" integer unsigned NULL CHECK ("unique_competitors" >= 0), "content_hash" varchar(64) NOT NULL, "snapshot_id" integer NOT NULL REFERENCES "api_statisticssnapshot" ("id") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "api_growth_annual_row_uniq" UNIQUE ("snapshot_id", "metric", "year", "region_code", "event_id"));
CREATE INDEX IF NOT EXISTS "api_growth_metric_lookup_idx" ON "api_growthannualrecord" ("snapshot_id", "metric", "region_code", "year");
CREATE INDEX IF NOT EXISTS "api_growthannualrecord_snapshot_id_9ddce017" ON "api_growthannualrecord" ("snapshot_id");

CREATE TABLE IF NOT EXISTS "authtoken_token" ("key" varchar(40) NOT NULL PRIMARY KEY, "created" datetime NOT NULL, "user_id" integer NOT NULL UNIQUE REFERENCES "api_user" ("id") DEFERRABLE INITIALLY DEFERRED);

CREATE TABLE IF NOT EXISTS "socialaccount_socialapp" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "provider" varchar(30) NOT NULL, "name" varchar(40) NOT NULL, "client_id" varchar(191) NOT NULL, "key" varchar(191) NOT NULL, "secret" varchar(191) NOT NULL);

CREATE TABLE IF NOT EXISTS "socialaccount_socialaccount" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "provider" varchar(30) NOT NULL, "uid" varchar(191) NOT NULL, "last_login" datetime NOT NULL, "date_joined" datetime NOT NULL, "user_id" integer NOT NULL REFERENCES "api_user" ("id") DEFERRABLE INITIALLY DEFERRED, "extra_data" text NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "socialaccount_socialaccount_provider_uid_fc810c6e_uniq" ON "socialaccount_socialaccount" ("provider", "uid");
CREATE INDEX IF NOT EXISTS "socialaccount_socialaccount_user_id_8146e70c" ON "socialaccount_socialaccount" ("user_id");

