import { IconMemora } from "../app/icons";
import type { AiProviderId } from "../domain/ai";
import { providerBrandFor } from "../domain/providerBrand";

interface ProviderBrandIconProps {
  providerId: AiProviderId;
}

export function ProviderBrandIcon({ providerId }: ProviderBrandIconProps) {
  const brand = providerBrandFor(providerId);

  if (!brand.src) {
    return (
      <span aria-hidden="true" className="provider-brand-icon provider-brand-icon--fallback" data-brand={brand.id}>
        <IconMemora size={16} />
      </span>
    );
  }

  return <img alt="" aria-hidden="true" className="provider-brand-icon" data-asset={brand.asset} data-brand={brand.id} src={brand.src} />;
}
