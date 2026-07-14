import { IconSparkles } from "../app/icons";
import { modelBrandFor } from "../domain/modelBrand";

interface ModelBrandIconProps {
  modelId: string;
}

export function ModelBrandIcon({ modelId }: ModelBrandIconProps) {
  const brand = modelBrandFor(modelId);

  if (brand.src) {
    return <img alt="" aria-hidden="true" className="model-brand-icon" data-brand={brand.id} src={brand.src} />;
  }

  return (
    <span aria-hidden="true" className="model-brand-icon model-brand-icon--fallback" data-brand="fallback">
      <IconSparkles size={18} />
    </span>
  );
}
