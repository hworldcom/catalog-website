import { t, type T } from "@/lib/i18n";

import type { SellerCompanyCodeErrorCode } from "./company-code";

export const companyCodeCopy = {
  label: t("Company code*", "Kod firmy*", "Firmencode*", "Mã công ty*"),
  onboardingHelp: t(
    "This code becomes part of every product code. You can change it until your first product code is created.",
    "Ten kod stanie się częścią każdego kodu produktu. Możesz go zmienić do czasu utworzenia pierwszego kodu produktu.",
    "Dieser Code wird Teil jedes Produktcodes. Du kannst ihn ändern, bis der erste Produktcode erstellt wurde.",
    "Mã này sẽ là một phần của mọi mã sản phẩm. Bạn có thể đổi mã cho đến khi mã sản phẩm đầu tiên được tạo.",
  ),
  unlockedHelp: t(
    "You can change this code until your first product code is created.",
    "Możesz zmienić ten kod do czasu utworzenia pierwszego kodu produktu.",
    "Du kannst diesen Code ändern, bis der erste Produktcode erstellt wurde.",
    "Bạn có thể đổi mã này cho đến khi mã sản phẩm đầu tiên được tạo.",
  ),
  lockedHelp: t(
    "This code is locked because a product code has already been created.",
    "Ten kod jest zablokowany, ponieważ kod produktu został już utworzony.",
    "Dieser Code ist gesperrt, weil bereits ein Produktcode erstellt wurde.",
    "Mã này đã bị khóa vì một mã sản phẩm đã được tạo.",
  ),
  onboardingUnavailable: t(
    "The storefront could not be created. Try again.",
    "Nie udało się utworzyć sklepu. Spróbuj ponownie.",
    "Der Shop konnte nicht erstellt werden. Versuche es erneut.",
    "Không thể tạo gian hàng. Hãy thử lại.",
  ),
  onboardingSuccess: t(
    "Storefront created. A few more steps remain before publication.",
    "Sklep został utworzony. Przed publikacją pozostało jeszcze kilka kroków.",
    "Der Shop wurde erstellt. Bis zur Veröffentlichung fehlen noch einige Schritte.",
    "Gian hàng đã được tạo. Vẫn còn một vài bước trước khi xuất bản.",
  ),
  saveUnavailable: t(
    "The company code could not be saved. Try again.",
    "Nie udało się zapisać kodu firmy. Spróbuj ponownie.",
    "Der Firmencode konnte nicht gespeichert werden. Versuche es erneut.",
    "Không thể lưu mã công ty. Hãy thử lại.",
  ),
  saveSuccess: t(
    "Storefront saved.",
    "Sklep został zapisany.",
    "Der Shop wurde gespeichert.",
    "Gian hàng đã được lưu.",
  ),
} satisfies Record<string, T>;

export const companyCodeErrorCopy: Record<SellerCompanyCodeErrorCode, T> = {
  seller_company_code_invalid: t(
    "Enter a valid company code: three letters or digits, followed only by optional digits.",
    "Wprowadź prawidłowy kod firmy: trzy litery lub cyfry, a następnie opcjonalnie tylko cyfry.",
    "Gib einen gültigen Firmencode ein: drei Buchstaben oder Ziffern, danach optional nur Ziffern.",
    "Nhập mã công ty hợp lệ: ba chữ cái hoặc chữ số, sau đó chỉ có thể thêm chữ số.",
  ),
  seller_company_code_taken: t(
    "This company code is already in use. Choose another code.",
    "Ten kod firmy jest już używany. Wybierz inny kod.",
    "Dieser Firmencode wird bereits verwendet. Wähle einen anderen Code.",
    "Mã công ty này đã được sử dụng. Hãy chọn mã khác.",
  ),
  seller_company_code_exhausted: t(
    "No automatic company code is available. Enter a different code.",
    "Brak dostępnego automatycznego kodu firmy. Wprowadź inny kod.",
    "Es ist kein automatischer Firmencode verfügbar. Gib einen anderen Code ein.",
    "Không còn mã công ty tự động khả dụng. Hãy nhập mã khác.",
  ),
  seller_company_code_locked: t(
    "The company code is locked and can no longer be changed.",
    "Kod firmy jest zablokowany i nie można go już zmienić.",
    "Der Firmencode ist gesperrt und kann nicht mehr geändert werden.",
    "Mã công ty đã bị khóa và không thể thay đổi.",
  ),
  seller_company_code_not_found: t(
    "Your seller storefront could not be found.",
    "Nie znaleziono Twojego sklepu sprzedawcy.",
    "Dein Verkäufer-Shop wurde nicht gefunden.",
    "Không tìm thấy gian hàng người bán của bạn.",
  ),
  seller_slug_allocation_failed: t(
    "A storefront address could not be allocated. Change the business name and try again.",
    "Nie udało się przydzielić adresu sklepu. Zmień nazwę firmy i spróbuj ponownie.",
    "Es konnte keine Shop-Adresse vergeben werden. Ändere den Firmennamen und versuche es erneut.",
    "Không thể cấp địa chỉ gian hàng. Hãy đổi tên doanh nghiệp và thử lại.",
  ),
  seller_onboarding_invalid: t(
    "Check the storefront details and try again.",
    "Sprawdź dane sklepu i spróbuj ponownie.",
    "Prüfe die Shop-Daten und versuche es erneut.",
    "Kiểm tra thông tin gian hàng và thử lại.",
  ),
  seller_business_category_not_supported: t(
    "Select the supported Fashion business category.",
    "Wybierz obsługiwaną kategorię firmy Moda.",
    "Wähle die unterstützte Geschäftskategorie Mode.",
    "Chọn danh mục doanh nghiệp Thời trang được hỗ trợ.",
  ),
};
