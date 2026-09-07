
import multer from "multer";

// setup multer for handling file uploads
 const storage = multer.memoryStorage()
 export const upload = multer({storage: storage})
