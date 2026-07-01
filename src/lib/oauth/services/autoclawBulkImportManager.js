import crypto from "node:crypto";
import {
  KiroBulkImportManager,
  createFreshContext,
  buildLookupResponse,
} from "./kiroBulkImportManager.js";
import { createAutoclawCallbackMonitor, runAutoclawGoogleAutomation } from "./autoclawAutomation.js";
import { createProviderConnection } from "../../../models/index.js";

const AUTOCLAW_PROVIDER_ID = "autoclaw";

async function defaultSocialExchange({ access_token, refresh_token, user_id, user_name }) {
  const device = crypto.randomUUID();
  const conn = await createProviderConnection({
    provider: AUTOCLAW_PROVIDER_ID,
    authType: "access_token",
    name: user_name || String(user_id || "autoclaw-import"),
    email: String(user_id || "unknown"),
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    testStatus: "active",
    lastRefreshAt: new Date().toISOString(),
    providerSpecificData: {
      deviceId: device,
      userName: user_name,
      refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      importedAt: new Date().toISOString(),
    },
  });
  return { connection: conn };
}

export class AutoclawBulkImportManager extends KiroBulkImportManager {
  constructor({
    browserLauncher,
    googleAutomation = runAutoclawGoogleAutomation,
    socialExchange = defaultSocialExchange,
    storageName = "autoclaw-bulk-import",
  } = {}) {
    super({ browserLauncher, googleAutomation, socialExchange, storageName });
  }

  async processAccount(job, account, workerId, browser = job.browser) {
    if (job.cancelRequested || !browser) {
      this.finalizeAccount(account, "cancelled", { error: "Job cancelled" });
      return;
    }

    const deviceId = crypto.randomUUID();
    const { context, page } = await createFreshContext(browser);
    const callbackPromise = createAutoclawCallbackMonitor(context, page);
    account.runtimeSession = {
      context,
      page,
      proxyUrl: browser.__ninerouterProxyUrl || job.proxyUrl || null,
    };

    try {
      this.setAccountStep(account, "preparing_worker", `Worker ${workerId} preparing AutoClaw browser context`);
      await this.persistJobSnapshot(job, { forcePreview: false });

      const automationResult = await this.googleAutomation({
        page,
        email: account.email,
        password: account.password,
        deviceId,
        callbackPromise,
        onStep: (step, message) => {
          this.setAccountStep(account, step, message);
          void this.persistJobSnapshot(job, { forcePreview: false });
        },
      });

      if (automationResult.status === "success") {
        this.setAccountStep(account, "exchanging_tokens", "Saving AutoClaw connection");
        await this.persistJobSnapshot(job, { forcePreview: false });
        const { connection } = await this.socialExchange({
          access_token: automationResult.access_token,
          refresh_token: automationResult.refresh_token,
          user_id: automationResult.user_id,
          user_name: automationResult.user_name,
        });
        this.finalizeAccount(account, "success", {
          connectionId: connection.id,
          step: "connection_saved",
          message: "AutoClaw connection saved successfully",
        });
        account.runtimeSession = null;
        await context.close().catch(() => null);
        await this.persistJobSnapshot(job, { forcePreview: false });
        return;
      }

      if (automationResult.status === "needs_manual") {
        account.manualSession = {
          context,
          page,
          opened: false,
          openedAt: null,
          rebind: typeof callbackPromise?.rebind === "function" ? callbackPromise.rebind : null,
        };
        this.setAccountStep(account, "awaiting_manual", "Waiting for manual completion in the browser session");
        this.finalizeAccount(account, "needs_manual", {
          error: automationResult.error,
          step: "awaiting_manual",
          message: automationResult.error,
        });
        await this.persistJobSnapshot(job, { forcePreview: false });
        await this.runManualFollowup(
          job,
          account,
          workerId,
          context,
          callbackPromise,
          deviceId
        );
        return;
      }

      const terminalStatus = ["failed", "failed_invalid_credentials", "failed_timeout", "failed_restricted", "cancelled"].includes(
        automationResult.status
      )
        ? automationResult.status
        : "failed";
      this.finalizeAccount(account, terminalStatus, {
        error: automationResult.error || "AutoClaw automation failed.",
        step: terminalStatus,
        message: automationResult.error || "AutoClaw automation failed.",
      });
      account.runtimeSession = null;
      await context.close().catch(() => null);
      await this.persistJobSnapshot(job, { forcePreview: false });
    } catch (error) {
      this.finalizeAccount(account, "failed", {
        error: error.message || "Unexpected AutoClaw bulk import failure.",
        step: "failed",
        message: error.message || "Unexpected AutoClaw bulk import failure.",
      });
      account.runtimeSession = null;
      await context.close().catch(() => null);
      await this.persistJobSnapshot(job, { forcePreview: false });
    } finally {
      account.password = undefined;
    }
  }

  async runManualFollowup(job, account, workerId, context, callbackPromise, deviceId) {
    const followupPromise = (async () => {
      const closeManualResources = async () => {
        const ms = account.manualSession;
        const ctx = ms?.context || context;
        const headed = ms?.headedBrowser || null;
        if (ctx) await ctx.close().catch(() => null);
        if (headed) await headed.close().catch(() => null);
      };
      try {
        const callback = await callbackPromise;
        if (job.cancelRequested) {
          this.finalizeAccount(account, "cancelled", {
            error: "Job cancelled",
            step: "cancelled",
            message: "Job cancelled while waiting for manual completion",
          });
          await this.persistJobSnapshot(job, { forcePreview: false });
          return;
        }

        this.setAccountStep(account, "exchanging_tokens", "Saving AutoClaw connection");
        await this.persistJobSnapshot(job, { forcePreview: false });
        const { connection } = await this.socialExchange({
          access_token: callback.access_token,
          refresh_token: callback.refresh_token,
          user_id: callback.user_id,
          user_name: callback.user_name,
        });

        this.finalizeAccount(account, "success", {
          connectionId: connection.id,
          step: "connection_saved",
          message: "AutoClaw connection saved successfully",
        });
        await this.persistJobSnapshot(job, { forcePreview: false });
      } catch (error) {
        if (job.cancelRequested) {
          this.finalizeAccount(account, "cancelled", {
            error: "Job cancelled",
            step: "cancelled",
            message: "Job cancelled while waiting for manual completion",
          });
        } else {
          this.finalizeAccount(account, "failed_exchange", {
            error: error.message || "Manual assist flow failed during token exchange.",
            step: "exchange_failed",
            message: error.message || "Manual assist flow failed during token exchange.",
          });
        }
        await this.persistJobSnapshot(job, { forcePreview: false });
      } finally {
        await closeManualResources();
        account.manualSession = null;
        account.runtimeSession = null;
        job.manualFollowups.delete(followupPromise);
        await this.persistJobSnapshot(job, { forcePreview: false });
      }
    })();

    job.manualFollowups.add(followupPromise);
  }

}

function getSingletonStore() {
  if (!globalThis.__autoclawBulkImportSingleton) {
    globalThis.__autoclawBulkImportSingleton = {
      manager: new AutoclawBulkImportManager(),
    };
  }
  return globalThis.__autoclawBulkImportSingleton;
}

export function getAutoclawBulkImportManager() {
  return getSingletonStore().manager;
}

export { buildLookupResponse };
