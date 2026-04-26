import { createServiceRoleClient } from "@/lib/supabase/server";
import { FacebookPixelRuntime } from "@/components/tracking/FacebookPixelRuntime";
import { normalizeTrackingConfig } from "@/lib/tracking-config";

export async function FacebookPixelScript() {
  let pixelEnabled = false;
  let pixelId = "";
  let socialLinks: Record<string, unknown> | null = null;

  try {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from("site_settings")
      .select("pixel_enabled, facebook_pixel_id, social_links")
      .limit(1)
      .single();

    if (data) {
      pixelEnabled = data.pixel_enabled || false;
      pixelId = data.facebook_pixel_id || "";
      socialLinks = (data.social_links || null) as Record<string, unknown> | null;
    }
  } catch {
    // Silently fail if Supabase not configured
  }

  const config = normalizeTrackingConfig(socialLinks?.tracking_pixels_config, {
    enabled: pixelEnabled,
    pixelId,
  });
  const hasActivePixels = config.pixels.some(
    (pixel) => pixel.active && pixel.pixelId.trim()
  );
  const activePixelIds = config.pixels
    .filter((pixel) => pixel.active && pixel.pixelId.trim())
    .map((pixel) => pixel.pixelId.trim());

  if (!pixelEnabled || !hasActivePixels) return null;

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
          `,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.__azInitializedPixelIds = window.__azInitializedPixelIds || [];
            ${JSON.stringify(activePixelIds)}.forEach(function(pixelId) {
              if (!pixelId) return;
              if (window.__azInitializedPixelIds.indexOf(pixelId) === -1) {
                fbq('init', pixelId);
                window.__azInitializedPixelIds.push(pixelId);
              }
            });
          `,
        }}
      />
      <FacebookPixelRuntime config={config} />
    </>
  );
}
