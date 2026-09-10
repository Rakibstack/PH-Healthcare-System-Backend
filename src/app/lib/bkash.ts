import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
  try {
    const idTokenKey = "bkash:idToken";
    const refreshTokeKey = "bkash:refreshToken";

    let bkashIdToken = await redisClient.get(idTokenKey);
    const bkashRefreshToken = await redisClient.get(refreshTokeKey);
    const bkashIdTokenExpiration = await redisClient.ttl(idTokenKey);
    const bkashRefreshTokenExpiration = await redisClient.ttl(refreshTokeKey);

    if (
      (bkashIdTokenExpiration <= 600 || !bkashIdToken) &&
      bkashRefreshToken &&
      bkashRefreshTokenExpiration > 600
    ) {
      const refreshTokenResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/token/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            username: config.bkash_username,
            password: config.bkash_password,
          },
          body: JSON.stringify({
            app_key: config.bkash_app_key,
            app_secret: config.bkash_app_secret,
            refresh_token: bkashRefreshToken,
          }),
        },
      );
      if (!refreshTokenResponse.ok) {
        throw new Error("Bkash Refresh Token Grant Failed");
      }
      const refreshTokenResult = await refreshTokenResponse.json();
      bkashIdToken = refreshTokenResult.id_token as string;

      await redisClient.set(idTokenKey, bkashIdToken, {
        expiration: {
          type: "EX",
          value: Number(refreshTokenResult.expires_in),
        },
      });

      return bkashIdToken;
    }

    if (bkashIdToken && bkashIdTokenExpiration > 600) {
      return bkashIdToken;
    }

    const response = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/token/grant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Bkash Access Token Grant Failed");
    }
    const result = await response.json();
    // bkash id_token set
    await redisClient.set(idTokenKey, result.id_token, {
      expiration: {
        type: "EX",
        value: Number(result.expires_in),
      },
    });
    // bkash refresh token set
    await redisClient.set(refreshTokeKey, result.refresh_token, {
      expiration: {
        type: "EX",
        value: Number(result.refresh_expires_in),
      },
    });
    bkashIdToken = result.id_token;
    return bkashIdToken;
  } catch (error) {
    throw new Error(`Bkash Access Token Grant Failed: ${error}`);
  }
};
