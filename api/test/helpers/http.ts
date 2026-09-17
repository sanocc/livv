import { SELF } from "cloudflare:test";

export const managerHeaders = {
  "x-livv-mock-access-sub": "access-user-manager",
  "x-livv-mock-access-email": "manager@livv.test",
  "x-livv-mock-access-role": "manager",
  "content-type": "application/json"
};

export const viewerHeaders = {
  "x-livv-mock-access-sub": "access-user-viewer",
  "x-livv-mock-access-email": "viewer@livv.test",
  "x-livv-mock-access-role": "viewer",
  "content-type": "application/json"
};

export async function api(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`https://api.livv.test${path}`, init);
}

export async function json(response: Response): Promise<any> {
  return response.json();
}
