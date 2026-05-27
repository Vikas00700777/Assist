function convertImageToDataURL(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Please choose an image file."));
      return;
    }

    if (!file.type.startsWith("image/")) {
      reject(new Error("Selected file must be an image."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("Could not read the selected image."));
    };

    reader.readAsDataURL(file);
  });
}
