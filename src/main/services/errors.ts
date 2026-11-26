/** Transient: no connection, timeout, 5xx, 429. Work stays queued and is retried. */
export class DriveNetworkError extends Error {
  constructor(message = "Tidak ada koneksi") {
    super(message);
    this.name = "DriveNetworkError";
  }
}
export class DriveNotFoundError extends Error {
  constructor(message = "File tidak ditemukan di Drive") {
    super(message);
    this.name = "DriveNotFoundError";
  }
}
/** The user must sign in (again). Never retried automatically. */
export class AuthRequiredError extends Error {
  constructor(message = "Perlu login ulang") {
    super(message);
    this.name = "AuthRequiredError";
  }
}
