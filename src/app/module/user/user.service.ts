// biome-ignore lint/style/useImportType: <explanation>
import { UploadApiResponse } from "cloudinary";
import cloudinary from "../../lib/claudinary";
import { prisma } from "../../lib/prisma";

const updateUserProfile = async (buffer: Buffer, userId: string) => {
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
      },
      (error, result) => {
        if (error) {
          reject(new Error(error.message));
          return;
        }

        if (!result) {
          reject(new Error("Cloudinary upload failed"));
          return;
        }

        resolve(result);
      },
    );

    uploadStream.end(buffer)
  });

  // Cloudinary upload successfully completed
  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      imageUrl: result.secure_url,
      imagePublicId: result.public_id,
    },
    omit: {
      password: true,
    },
  });

  return updatedUser;
};

export const userService = {
  updateUserProfile,
};
