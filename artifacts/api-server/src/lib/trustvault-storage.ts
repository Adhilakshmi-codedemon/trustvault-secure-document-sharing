import {
  ObjectNotFoundError,
  ObjectStorageService,
  objectStorageClient,
} from "./objectStorage";

export const objectStorageService = new ObjectStorageService();

function privateFileForPath(objectPath: string) {
  if (
    !objectPath.startsWith("/objects/uploads/") ||
    objectPath.includes("..")
  ) {
    throw new Error("Invalid private document object path");
  }
  const privateDir = objectStorageService
    .getPrivateObjectDir()
    .replace(/\/+$/, "");
  const path = `${privateDir}/${objectPath.slice("/objects/".length)}`;
  const [bucketName, ...objectParts] = path
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  const objectName = objectParts.join("/");
  if (!bucketName || !objectName) {
    throw new Error("Invalid private object storage configuration");
  }
  return objectStorageClient.bucket(bucketName).file(objectName);
}

export async function createFinalizedCopy(
  stagedObjectPath: string,
): Promise<{ objectPath: string; file: Awaited<ReturnType<ObjectStorageService["getObjectEntityFile"]>> }> {
  const stagedFile =
    await objectStorageService.getObjectEntityFile(stagedObjectPath);
  const unusedUploadUrl = await objectStorageService.getObjectEntityUploadURL();
  const finalObjectPath =
    objectStorageService.normalizeObjectEntityPath(unusedUploadUrl);
  if (!finalObjectPath.startsWith("/objects/uploads/")) {
    throw new Error("Could not allocate a private final document path");
  }
  const finalFile = privateFileForPath(finalObjectPath);
  await stagedFile.copy(finalFile);
  return { objectPath: finalObjectPath, file: finalFile };
}

export async function deletePrivateObject(objectPath: string): Promise<void> {
  try {
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    await file.delete({ ignoreNotFound: true });
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) {
      throw error;
    }
  }
}
