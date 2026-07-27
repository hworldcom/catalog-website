export type InquiryFields = {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerCountry: string;
  message: string;
};

export function buildInquirySubmission({
  fields,
  sellerId,
  productId,
  source,
}: {
  fields: InquiryFields;
  sellerId: string;
  productId?: string;
  source: "form" | "whatsapp";
}) {
  const submission = {
    sellerId,
    buyerName: fields.buyerName.trim(),
    buyerEmail: fields.buyerEmail.trim(),
    buyerPhone: fields.buyerPhone.trim(),
    buyerCountry: fields.buyerCountry.trim(),
    message: fields.message.trim(),
    source,
  };

  return productId ? { ...submission, productId } : submission;
}
