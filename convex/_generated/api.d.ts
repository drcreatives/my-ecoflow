/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as backup from "../backup.js";
import type * as backupValidators from "../backupValidators.js";
import type * as backup_queries from "../backup_queries.js";
import type * as crons from "../crons.js";
import type * as devices from "../devices.js";
import type * as devices_internal from "../devices_internal.js";
import type * as displayTelemetry from "../displayTelemetry.js";
import type * as ecoflow from "../ecoflow.js";
import type * as ecoflowMqttDiagnostics from "../ecoflowMqttDiagnostics.js";
import type * as ecoflowTemperature from "../ecoflowTemperature.js";
import type * as ecoflowTemperatureMqttGet from "../ecoflowTemperatureMqttGet.js";
import type * as email from "../email.js";
import type * as email_log from "../email_log.js";
import type * as exports from "../exports.js";
import type * as googleDrive from "../googleDrive.js";
import type * as googleDriveApi from "../googleDriveApi.js";
import type * as googleDriveConfig from "../googleDriveConfig.js";
import type * as googleDrive_http from "../googleDrive_http.js";
import type * as googleDrive_queries from "../googleDrive_queries.js";
import type * as historyAnalytics from "../historyAnalytics.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as readingExport from "../readingExport.js";
import type * as readingQuality from "../readingQuality.js";
import type * as readings from "../readings.js";
import type * as schedules from "../schedules.js";
import type * as schedules_internal from "../schedules_internal.js";
import type * as settings from "../settings.js";
import type * as solarPanelTelemetry from "../solarPanelTelemetry.js";
import type * as temperatureHistory from "../temperatureHistory.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  backup: typeof backup;
  backupValidators: typeof backupValidators;
  backup_queries: typeof backup_queries;
  crons: typeof crons;
  devices: typeof devices;
  devices_internal: typeof devices_internal;
  displayTelemetry: typeof displayTelemetry;
  ecoflow: typeof ecoflow;
  ecoflowMqttDiagnostics: typeof ecoflowMqttDiagnostics;
  ecoflowTemperature: typeof ecoflowTemperature;
  ecoflowTemperatureMqttGet: typeof ecoflowTemperatureMqttGet;
  email: typeof email;
  email_log: typeof email_log;
  exports: typeof exports;
  googleDrive: typeof googleDrive;
  googleDriveApi: typeof googleDriveApi;
  googleDriveConfig: typeof googleDriveConfig;
  googleDrive_http: typeof googleDrive_http;
  googleDrive_queries: typeof googleDrive_queries;
  historyAnalytics: typeof historyAnalytics;
  http: typeof http;
  migrations: typeof migrations;
  readingExport: typeof readingExport;
  readingQuality: typeof readingQuality;
  readings: typeof readings;
  schedules: typeof schedules;
  schedules_internal: typeof schedules_internal;
  settings: typeof settings;
  solarPanelTelemetry: typeof solarPanelTelemetry;
  temperatureHistory: typeof temperatureHistory;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
