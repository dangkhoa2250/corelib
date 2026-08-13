use std::io::Read;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};
use std::sync::Arc;
use std::time::Duration;

use reqwest::blocking::{Client, Response};
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::Url;

use crate::media::{sniff_mime, MAX_MEDIA_BYTES};

pub const MAX_REMOTE_IMAGE_BYTES: usize = MAX_MEDIA_BYTES;
const MAX_REMOTE_IMAGE_PIXELS: u64 = 40_000_000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_REDIRECTS: usize = 3;
const MAX_REMOTE_IMAGE_GIF_FRAMES: usize = 256;
const MAX_REMOTE_IMAGE_GIF_TOTAL_PIXELS: u64 = 100_000_000;
const REMOTE_IMAGE_USER_AGENT: &str = "corelib-desktop/0.1 (remote image fetch)";
const REMOTE_IMAGE_ACCEPT: &str = "image/avif,image/webp,image/*";

#[derive(Debug)]
pub struct RemoteImage {
    pub bytes: Vec<u8>,
    pub mime_type: String,
}

pub fn validate_remote_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "remote image URL is invalid".to_owned())?;
    match url.scheme() {
        "http" | "https" => {
            let host = url
                .host_str()
                .ok_or_else(|| "remote image URL must include a host".to_owned())?;
            let host = host
                .strip_prefix('[')
                .and_then(|host| host.strip_suffix(']'))
                .unwrap_or(host);
            if host.parse::<IpAddr>().is_ok_and(is_forbidden_ip)
                || parse_numeric_ipv4(host).is_some_and(is_forbidden_ip)
            {
                return Err("remote image URL targets a private or reserved address".to_owned());
            }
            Ok(url)
        }
        _ => Err("remote image URL must use http or https".to_owned()),
    }
}

fn parse_numeric_ipv4(value: &str) -> Option<IpAddr> {
    let parts = value.split('.').collect::<Vec<_>>();
    if parts.is_empty() || parts.len() > 4 || parts.iter().any(|part| part.is_empty()) {
        return None;
    }
    let numbers = parts
        .iter()
        .map(|part| parse_numeric_component(part))
        .collect::<Option<Vec<_>>>()?;
    let address = match numbers.as_slice() {
        [one] => *one,
        [one, two] if *one <= u32::from(u8::MAX) && *two <= 0x00ff_ffff => (*one << 24) | *two,
        [one, two, three]
            if *one <= u32::from(u8::MAX) && *two <= u32::from(u8::MAX) && *three <= 0xffff =>
        {
            (*one << 24) | (*two << 16) | *three
        }
        [one, two, three, four]
            if [one, two, three, four]
                .iter()
                .all(|part| **part <= u32::from(u8::MAX)) =>
        {
            (*one << 24) | (*two << 16) | (*three << 8) | *four
        }
        _ => return None,
    };
    Some(IpAddr::from(Ipv4Addr::from(address)))
}

fn parse_numeric_component(value: &str) -> Option<u32> {
    let (digits, radix) = if value.starts_with("0x") || value.starts_with("0X") {
        (&value[2..], 16)
    } else if value.len() > 1 && value.starts_with('0') {
        (&value[1..], 8)
    } else {
        (value, 10)
    };
    if digits.is_empty() {
        return None;
    }
    u32::from_str_radix(digits, radix).ok()
}

fn is_forbidden_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => [
            ([0, 0, 0, 0], 8),
            ([10, 0, 0, 0], 8),
            ([100, 64, 0, 0], 10),
            ([127, 0, 0, 0], 8),
            ([169, 254, 0, 0], 16),
            ([172, 16, 0, 0], 12),
            ([192, 0, 0, 0], 24),
            ([192, 0, 2, 0], 24),
            ([192, 88, 99, 0], 24),
            ([192, 168, 0, 0], 16),
            ([198, 18, 0, 0], 15),
            ([198, 51, 100, 0], 24),
            ([203, 0, 113, 0], 24),
            ([224, 0, 0, 0], 4),
            ([240, 0, 0, 0], 4),
        ]
        .into_iter()
        .any(|(network, prefix)| ipv4_in_cidr(address, network, prefix)),
        IpAddr::V6(address) => {
            let forbidden = [
                (Ipv6Addr::UNSPECIFIED, 128),
                (Ipv6Addr::LOCALHOST, 128),
                (Ipv6Addr::from(0xfc00u128 << 112), 7),
                (Ipv6Addr::from(0xfe80u128 << 112), 10),
                (Ipv6Addr::from(0xff00u128 << 112), 8),
                (Ipv6Addr::from(0x20010db8u128 << 96), 32),
                (Ipv6Addr::from(0x20010002u128 << 80), 48),
                (Ipv6Addr::from(0x0100u128 << 64), 64),
                (Ipv6Addr::from(0xfec0u128 << 112), 10),
                (Ipv6Addr::from(0x2002u128 << 112), 16),
                (Ipv6Addr::from(0x2001u128 << 112), 32),
                (Ipv6Addr::from(0x64ff9b_u128 << 96), 96),
            ];
            forbidden
                .into_iter()
                .any(|(network, prefix)| ipv6_in_cidr(address, network, prefix))
                || is_forbidden_mapped_ipv4(address)
        }
    }
}

fn ipv4_in_cidr(address: Ipv4Addr, network: [u8; 4], prefix: u8) -> bool {
    let mask = if prefix == 0 {
        0
    } else {
        u32::MAX << (32 - u32::from(prefix))
    };
    u32::from(address) & mask == u32::from(Ipv4Addr::from(network)) & mask
}

fn ipv6_in_cidr(address: Ipv6Addr, network: Ipv6Addr, prefix: u8) -> bool {
    let mask = if prefix == 0 {
        0
    } else {
        u128::MAX << (128 - u32::from(prefix))
    };
    u128::from(address) & mask == u128::from(network) & mask
}

fn is_forbidden_mapped_ipv4(address: Ipv6Addr) -> bool {
    let segments = address.segments();
    segments[..5].iter().all(|segment| *segment == 0)
        && segments[5] == 0xffff
        && is_forbidden_ip(IpAddr::from(Ipv4Addr::new(
            (segments[6] >> 8) as u8,
            segments[6] as u8,
            (segments[7] >> 8) as u8,
            segments[7] as u8,
        )))
}

struct SystemResolver;

impl Resolve for SystemResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let result = (name.as_str(), 0)
            .to_socket_addrs()
            .map(|addresses| Box::new(addresses) as Addrs)
            .map_err(|error| Box::new(error) as Box<dyn std::error::Error + Send + Sync>);
        Box::pin(std::future::ready(result))
    }
}

struct FilteredResolver {
    inner: Arc<dyn Resolve>,
    allow_loopback: bool,
}

impl FilteredResolver {
    fn new(inner: impl Resolve + 'static) -> Self {
        Self {
            inner: Arc::new(inner),
            allow_loopback: false,
        }
    }

    #[cfg(test)]
    fn new_for_local_fixture(inner: impl Resolve + 'static) -> Self {
        Self {
            inner: Arc::new(inner),
            allow_loopback: true,
        }
    }
}

impl Resolve for FilteredResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let is_local_fixture = self.allow_loopback && name.as_str() == "test.invalid";
        let resolving = self.inner.resolve(name);
        Box::pin(async move {
            let addresses = resolving.await?;
            let addresses = addresses
                .filter(|address| {
                    !is_forbidden_ip(address.ip())
                        || (is_local_fixture && address.ip().is_loopback())
                })
                .collect::<Vec<_>>();
            if addresses.is_empty() {
                return Err("DNS resolved only to private or reserved addresses".into());
            }
            Ok(Box::new(addresses.into_iter()) as Addrs)
        })
    }
}

pub fn validate_image_bytes(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_REMOTE_IMAGE_BYTES {
        return Err(format!(
            "remote image exceeds the {} MiB limit",
            MAX_REMOTE_IMAGE_BYTES / (1024 * 1024)
        ));
    }
    let mime =
        sniff_mime(bytes).ok_or_else(|| "remote response is not a supported image".to_owned())?;
    let valid = match mime {
        "image/png" => {
            bytes.len() >= 24
                && &bytes[12..16] == b"IHDR"
                && bytes[16..20].iter().any(|byte| *byte != 0)
                && bytes[20..24].iter().any(|byte| *byte != 0)
        }
        "image/jpeg" => bytes.len() >= 4 && bytes.ends_with(&[0xff, 0xd9]),
        "image/gif" => bytes.len() >= 14 && bytes[6..10].iter().any(|byte| *byte != 0),
        "image/webp" => {
            bytes.len() >= 16 && u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) >= 8
        }
        _ => false,
    };
    if !valid {
        Err("remote response is a truncated or invalid image".to_owned())
    } else {
        if mime == "image/png" && !png_is_structurally_valid(bytes) {
            return Err("remote response is a truncated or invalid image".to_owned());
        }
        if mime == "image/webp" && !webp_is_structurally_valid(bytes) {
            return Err("remote response is a truncated or invalid image".to_owned());
        }
        if mime == "image/gif" {
            match gif_frames_within_pixel_limit(bytes) {
                Ok(()) => {}
                Err(true) => {
                    return Err(format!(
                        "remote image exceeds the {MAX_REMOTE_IMAGE_PIXELS} pixel limit"
                    ));
                }
                Err(false) => {
                    return Err("remote response is a truncated or invalid image".to_owned());
                }
            }
        }
        let (width, height) = image_dimensions(mime, bytes)
            .ok_or_else(|| "remote response is a truncated or invalid image".to_owned())?;
        let pixels = u64::from(width)
            .checked_mul(u64::from(height))
            .ok_or_else(|| "remote image exceeds the pixel limit".to_owned())?;
        if width == 0 || height == 0 || pixels > MAX_REMOTE_IMAGE_PIXELS {
            return Err(format!(
                "remote image exceeds the {MAX_REMOTE_IMAGE_PIXELS} pixel limit"
            ));
        }
        Ok(mime.to_owned())
    }
}

fn png_is_structurally_valid(bytes: &[u8]) -> bool {
    if bytes.len() < 8 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return false;
    }
    let mut index = 8usize;
    let mut has_ihdr = false;
    let mut has_idat = false;
    let mut has_iend = false;
    while index < bytes.len() {
        if index.checked_add(12).is_none_or(|end| end > bytes.len()) {
            return false;
        }
        let length = match bytes[index..index + 4].try_into() {
            Ok(value) => usize::try_from(u32::from_be_bytes(value)).ok(),
            Err(_) => None,
        };
        let Some(length) = length else {
            return false;
        };
        let Some(chunk_end) = index
            .checked_add(12)
            .and_then(|end| end.checked_add(length))
        else {
            return false;
        };
        if chunk_end > bytes.len() {
            return false;
        }
        let Ok(kind) = bytes[index + 4..index + 8].try_into() else {
            return false;
        };
        let data = &bytes[index + 8..index + 8 + length];
        let Ok(crc_bytes) = bytes[index + 8 + length..chunk_end].try_into() else {
            return false;
        };
        let crc = u32::from_be_bytes(crc_bytes);
        if kind == *b"IHDR" {
            if has_ihdr || length != 13 || png_crc32(&kind, data) != crc {
                return false;
            }
            has_ihdr = true;
        } else if kind == *b"IDAT" {
            if !has_ihdr {
                return false;
            }
            has_idat = true;
        } else if kind == *b"IEND" {
            if length != 0 || png_crc32(&kind, data) != crc {
                return false;
            }
            has_iend = true;
            index = chunk_end;
            break;
        }
        index = chunk_end;
    }
    has_ihdr && has_idat && has_iend && index == bytes.len()
}

fn png_crc32(kind: &[u8; 4], data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff;
    for byte in kind.iter().chain(data) {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

fn gif_frames_within_pixel_limit(bytes: &[u8]) -> Result<(), bool> {
    if bytes.len() < 14 {
        return Err(false);
    }
    let packed = bytes[10];
    let mut index: usize = 13;
    let mut frame_count = 0usize;
    let mut total_pixels = 0u64;
    if packed & 0x80 != 0 {
        let table_size = 3usize
            .checked_mul(1usize << usize::from((packed & 0x07) + 1))
            .ok_or(false)?;
        index = index.checked_add(table_size).ok_or(false)?;
        if index > bytes.len() {
            return Err(false);
        }
    }
    while index < bytes.len() {
        match bytes[index] {
            0x3b => return Ok(()),
            0x21 => {
                index = index.checked_add(2).ok_or(false)?;
                index = skip_gif_sub_blocks(bytes, index).ok_or(false)?;
            }
            0x2c => {
                if index.checked_add(10).ok_or(false)? > bytes.len() {
                    return Err(false);
                }
                let width = u32::from(u16::from_le_bytes([bytes[index + 5], bytes[index + 6]]));
                let height = u32::from(u16::from_le_bytes([bytes[index + 7], bytes[index + 8]]));
                if width == 0 || height == 0 {
                    return Err(false);
                }
                if u64::from(width)
                    .checked_mul(u64::from(height))
                    .is_none_or(|pixels| pixels > MAX_REMOTE_IMAGE_PIXELS)
                {
                    return Err(true);
                }
                frame_count = frame_count.checked_add(1).ok_or(true)?;
                if frame_count > MAX_REMOTE_IMAGE_GIF_FRAMES {
                    return Err(true);
                }
                let frame_pixels = u64::from(width)
                    .checked_mul(u64::from(height))
                    .ok_or(true)?;
                total_pixels = total_pixels.checked_add(frame_pixels).ok_or(true)?;
                if total_pixels > MAX_REMOTE_IMAGE_GIF_TOTAL_PIXELS {
                    return Err(true);
                }
                let descriptor_packed = bytes[index + 9];
                index += 10;
                if descriptor_packed & 0x80 != 0 {
                    let table_size = 3usize
                        .checked_mul(1usize << usize::from((descriptor_packed & 0x07) + 1))
                        .ok_or(false)?;
                    index = index.checked_add(table_size).ok_or(false)?;
                    if index > bytes.len() {
                        return Err(false);
                    }
                }
                if index >= bytes.len() {
                    return Err(false);
                }
                index += 1;
                index = skip_gif_sub_blocks(bytes, index).ok_or(false)?;
            }
            _ => return Err(false),
        }
    }
    Err(false)
}

fn skip_gif_sub_blocks(bytes: &[u8], mut index: usize) -> Option<usize> {
    loop {
        let size = usize::from(*bytes.get(index)?);
        index = index.checked_add(1)?;
        if size == 0 {
            return Some(index);
        }
        index = index.checked_add(size)?;
        if index > bytes.len() {
            return None;
        }
    }
}

fn image_dimensions(mime: &str, bytes: &[u8]) -> Option<(u32, u32)> {
    match mime {
        "image/png" if bytes.len() >= 24 => Some((
            u32::from_be_bytes(bytes[16..20].try_into().ok()?),
            u32::from_be_bytes(bytes[20..24].try_into().ok()?),
        )),
        "image/jpeg" => jpeg_dimensions(bytes),
        "image/gif" if bytes.len() >= 10 => Some((
            u32::from(u16::from_le_bytes(bytes[6..8].try_into().ok()?)),
            u32::from(u16::from_le_bytes(bytes[8..10].try_into().ok()?)),
        )),
        "image/webp" => webp_dimensions(bytes),
        _ => None,
    }
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 4 || bytes[..2] != [0xff, 0xd8] {
        return None;
    }
    let mut index = 2;
    let mut dimensions = None;
    while index < bytes.len() {
        while index < bytes.len() && bytes[index] != 0xff {
            index += 1;
        }
        while index < bytes.len() && bytes[index] == 0xff {
            index += 1;
        }
        if index >= bytes.len() {
            return None;
        }
        let marker = bytes[index];
        index += 1;
        if marker == 0xd9 {
            return None;
        }
        if marker == 0xd8 || marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            continue;
        }
        if index + 2 > bytes.len() {
            return None;
        }
        let segment_length = usize::from(u16::from_be_bytes([bytes[index], bytes[index + 1]]));
        if segment_length < 2 || index + segment_length > bytes.len() {
            return None;
        }
        if is_jpeg_sof(marker) && segment_length >= 7 {
            let height = u32::from(u16::from_be_bytes([bytes[index + 3], bytes[index + 4]]));
            let width = u32::from(u16::from_be_bytes([bytes[index + 5], bytes[index + 6]]));
            dimensions = Some((width, height));
        } else if marker == 0xda {
            let scan_start = index + segment_length;
            let eoi = bytes.len().checked_sub(2)?;
            if dimensions.is_none() || !bytes.ends_with(&[0xff, 0xd9]) || scan_start >= eoi {
                return None;
            }
            return dimensions;
        }
        index += segment_length;
    }
    None
}

fn is_jpeg_sof(marker: u8) -> bool {
    matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf)
}

fn webp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let (vp8x, vp8, vp8l) = webp_chunks(bytes)?;
    if let Some(data) = vp8x {
        return Some((
            u32::from_le_bytes([data[4], data[5], data[6], 0]).checked_add(1)?,
            u32::from_le_bytes([data[7], data[8], data[9], 0]).checked_add(1)?,
        ));
    }
    if let Some(data) = vp8 {
        return Some((
            u32::from(u16::from_le_bytes([data[6], data[7]]) & 0x3fff),
            u32::from(u16::from_le_bytes([data[8], data[9]]) & 0x3fff),
        ));
    }
    let data = vp8l?;
    Some((
        1 + u32::from(data[1]) + (u32::from(data[2] & 0x3f) << 8),
        1 + u32::from(data[2] >> 6) + (u32::from(data[3]) << 2) + (u32::from(data[4] & 0x0f) << 10),
    ))
}

fn webp_is_structurally_valid(bytes: &[u8]) -> bool {
    webp_chunks(bytes)
        .map(|(_, vp8, vp8l)| vp8.is_some() || vp8l.is_some())
        .unwrap_or(false)
}

type WebpChunks<'a> = (Option<&'a [u8]>, Option<&'a [u8]>, Option<&'a [u8]>);

fn webp_chunks(bytes: &[u8]) -> Option<WebpChunks<'_>> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }
    let declared_length = usize::try_from(u32::from_le_bytes(bytes[4..8].try_into().ok()?)).ok()?;
    if declared_length.checked_add(8) != Some(bytes.len()) {
        return None;
    }
    let mut index = 12usize;
    let mut vp8x = None;
    let mut vp8 = None;
    let mut vp8l = None;
    while index < bytes.len() {
        let header_end = index.checked_add(8)?;
        if header_end > bytes.len() {
            return None;
        }
        let kind: [u8; 4] = bytes[index..index + 4].try_into().ok()?;
        let length = usize::try_from(u32::from_le_bytes(
            bytes[index + 4..header_end].try_into().ok()?,
        ))
        .ok()?;
        let padded_length = length.checked_add(length % 2)?;
        let chunk_end = header_end.checked_add(padded_length)?;
        if chunk_end > bytes.len() {
            return None;
        }
        let data = &bytes[header_end..header_end + length];
        match &kind {
            b"VP8X" => {
                if length != 10 || vp8x.is_some() {
                    return None;
                }
                vp8x = Some(data);
            }
            b"VP8 " => {
                if data.len() < 10 || data[3..6] != [0x9d, 0x01, 0x2a] {
                    return None;
                }
                vp8 = Some(data);
            }
            b"VP8L" => {
                if data.len() < 5 || data[0] != 0x2f {
                    return None;
                }
                vp8l = Some(data);
            }
            _ => {}
        }
        index = chunk_end;
    }
    Some((vp8x, vp8, vp8l))
}

fn resolve_redirect(current: &Url, location: &str) -> Result<Url, String> {
    let next = current
        .join(location)
        .map_err(|_| "remote image redirect location is invalid".to_owned())?;
    let next = validate_remote_url(next.as_str())?;
    if current.scheme() == "https" && next.scheme() == "http" {
        return Err("remote image redirect cannot downgrade HTTPS to HTTP".to_owned());
    }
    Ok(next)
}

pub fn fetch(url: &str) -> Result<RemoteImage, String> {
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .dns_resolver(Arc::new(FilteredResolver::new(SystemResolver)))
        .no_proxy()
        .build()
        .map_err(|error| format!("failed to configure image client: {error}"))?;
    fetch_with_client(url, client)
}

#[cfg(test)]
pub(crate) fn fetch_for_command_tests(url: &str) -> Result<RemoteImage, String> {
    let url = validate_remote_url(url)?;
    let port = url
        .port()
        .ok_or_else(|| "test fixture URL must include a server port".to_owned())?;
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .dns_resolver(Arc::new(FilteredResolver::new_for_local_fixture(
            LocalFixtureResolver { port },
        )))
        .no_proxy()
        .build()
        .map_err(|error| format!("failed to configure test image client: {error}"))?;
    fetch_with_client(url.as_str(), client)
}

#[cfg(test)]
struct LocalFixtureResolver {
    port: u16,
}

#[cfg(test)]
impl LocalFixtureResolver {
    fn for_url(url: &Url) -> Self {
        Self {
            port: url.port().expect("fixture URL port"),
        }
    }
}

#[cfg(test)]
impl Resolve for LocalFixtureResolver {
    fn resolve(&self, _name: Name) -> Resolving {
        let addresses: Addrs = Box::new(std::iter::once(std::net::SocketAddr::from((
            [127, 0, 0, 1],
            self.port,
        ))));
        Box::pin(std::future::ready(Ok(addresses)))
    }
}

fn fetch_with_client(url: &str, client: Client) -> Result<RemoteImage, String> {
    let mut current = validate_remote_url(url)?;

    for redirect_count in 0..=MAX_REDIRECTS {
        let response = client
            .get(current.clone())
            .header(reqwest::header::USER_AGENT, REMOTE_IMAGE_USER_AGENT)
            .header(reqwest::header::ACCEPT, REMOTE_IMAGE_ACCEPT)
            .send()
            .map_err(|error| format!("failed to fetch remote image: {error}"))?;
        if response.status().is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err("remote image exceeded the redirect limit".to_owned());
            }
            current = response
                .headers()
                .get(reqwest::header::LOCATION)
                .ok_or_else(|| "remote image redirect has no location".to_owned())
                .and_then(|location| {
                    let location = location
                        .to_str()
                        .map_err(|_| "remote image redirect location is invalid".to_owned())?;
                    resolve_redirect(&current, location)
                })?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!(
                "remote image request returned {}",
                response.status()
            ));
        }
        let bytes = read_bounded(response)?;
        let mime_type = validate_image_bytes(&bytes)?;
        return Ok(RemoteImage { bytes, mime_type });
    }
    unreachable!("redirect loop returns before this point")
}

fn read_bounded(mut response: Response) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_REMOTE_IMAGE_BYTES as u64)
    {
        return Err(format!(
            "remote image exceeds the {} MiB limit",
            MAX_REMOTE_IMAGE_BYTES / (1024 * 1024)
        ));
    }
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take((MAX_REMOTE_IMAGE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read remote image: {error}"))?;
    if bytes.len() > MAX_REMOTE_IMAGE_BYTES {
        return Err(format!(
            "remote image exceeds the {} MiB limit",
            MAX_REMOTE_IMAGE_BYTES / (1024 * 1024)
        ));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener, TcpStream};
    use std::task::{Context, Waker};
    use std::thread;

    use reqwest::dns::{Addrs, Name, Resolve, Resolving};

    use super::*;

    struct StaticResolver {
        addresses: Vec<SocketAddr>,
    }

    impl Resolve for StaticResolver {
        fn resolve(&self, _name: Name) -> Resolving {
            let addresses: Addrs = Box::new(self.addresses.clone().into_iter());
            Box::pin(std::future::ready(Ok(addresses)))
        }
    }

    fn resolver(addresses: &[&str]) -> StaticResolver {
        StaticResolver {
            addresses: addresses
                .iter()
                .map(|address| address.parse().expect("socket address"))
                .collect(),
        }
    }

    fn resolved_addresses(resolving: Resolving) -> Result<Vec<SocketAddr>, String> {
        let mut resolving = resolving;
        let waker = Waker::noop();
        let mut context = Context::from_waker(waker);
        match resolving.as_mut().poll(&mut context) {
            std::task::Poll::Ready(result) => result
                .map(|addresses| addresses.collect())
                .map_err(|error| error.to_string()),
            std::task::Poll::Pending => Err("test resolver unexpectedly pending".to_owned()),
        }
    }

    fn serve_once(body: Vec<u8>, content_length: Option<usize>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("test server address");
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept test request");
            read_request_headers(&mut stream);
            let length = content_length.unwrap_or(body.len());
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {length}\r\nContent-Type: text/plain\r\n\r\n"
            );
            stream
                .write_all(response.as_bytes())
                .expect("write headers");
            stream.write_all(&body).expect("write body");
        });
        format!("http://test.invalid:{}/image", address.port())
    }

    fn serve_redirect_chain() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind redirect server");
        let address = listener.local_addr().expect("redirect server address");
        thread::spawn(move || {
            for index in 0..=MAX_REDIRECTS {
                let (mut stream, _) = listener.accept().expect("accept redirect request");
                read_request_headers(&mut stream);
                let response = format!(
                    "HTTP/1.1 302 Found\r\nLocation: /redirect-{}\r\nContent-Length: 0\r\n\r\n",
                    index + 1
                );
                stream
                    .write_all(response.as_bytes())
                    .expect("write redirect");
            }
        });
        format!("http://test.invalid:{}/redirect-0", address.port())
    }

    fn read_request_headers(stream: &mut TcpStream) {
        let mut request = Vec::new();
        let mut byte = [0u8; 1];
        while !request.windows(4).any(|window| window == b"\r\n\r\n") {
            stream.read_exact(&mut byte).expect("read test request");
            request.push(byte[0]);
            assert!(request.len() <= 64 * 1024, "test request headers too large");
        }
    }

    fn serve_once_and_capture_request(
        body: Vec<u8>,
    ) -> (String, std::sync::mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("test server address");
        let (sender, receiver) = std::sync::mpsc::channel();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept test request");
            let mut request = Vec::new();
            let mut byte = [0u8; 1];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                stream.read_exact(&mut byte).expect("read test request");
                request.push(byte[0]);
            }
            sender
                .send(String::from_utf8(request).expect("UTF-8 request"))
                .expect("send request");
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: image/jpeg\r\n\r\n",
                body.len()
            );
            stream
                .write_all(response.as_bytes())
                .expect("write headers");
            stream.write_all(&body).expect("write body");
        });
        (
            format!("http://test.invalid:{}/image", address.port()),
            receiver,
        )
    }

    #[test]
    fn rejects_non_http_urls() {
        let error = validate_remote_url("file:///tmp/image.png").expect_err("file URL");
        assert!(error.contains("http"));
    }

    #[test]
    fn rejects_private_and_odd_numeric_ip_literals() {
        for value in [
            "http://127.0.0.1/image",
            "http://2130706433/image",
            "http://0x7f000001/image",
            "http://017700000001/image",
            "http://127.1/image",
            "http://169.254.169.254/image",
            "http://[::ffff:127.0.0.1]/image",
            "http://[::1]/image",
            "http://[ff02::1]/image",
        ] {
            if value.contains("ffff") {
                assert!(is_forbidden_ip("::ffff:127.0.0.1".parse().unwrap()));
            }
            validate_remote_url(value).expect_err(value);
        }
    }

    #[test]
    fn rejects_special_networks_but_allows_public_addresses() {
        for value in [
            "http://192.0.0.1/image",
            "http://192.88.99.42/image",
            "http://[fec0::1]/image",
            "http://[2002::1]/image",
            "http://[2001::1]/image",
            "http://[64:ff9b::1]/image",
        ] {
            validate_remote_url(value).expect_err(value);
        }
        for value in [
            "http://8.8.8.8/image",
            "http://93.184.216.34/image",
            "http://[2001:4860:4860::8888]/image",
        ] {
            validate_remote_url(value).expect("public address");
        }
    }

    #[test]
    fn resolver_filters_mixed_addresses() {
        let resolver = FilteredResolver::new(resolver(&["127.0.0.1:80", "93.184.216.34:80"]));
        let addrs = resolved_addresses(resolver.resolve("example.test".parse().unwrap()))
            .expect("one public address");
        assert_eq!(addrs, vec!["93.184.216.34:80".parse().unwrap()]);
    }

    #[test]
    fn command_path_client_filters_private_dns_before_connecting() {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_millis(100))
            .dns_resolver(Arc::new(FilteredResolver::new(resolver(&[
                "127.0.0.1:80",
                "93.184.216.34:80",
            ]))))
            .no_proxy()
            .build()
            .expect("command test client");
        let error = fetch_with_client("http://mixed.test/image", client)
            .expect_err("test public address is not an image server");
        assert!(!error.contains("DNS resolved only to private"), "{error}");
    }

    #[test]
    fn local_fixture_resolver_uses_the_spawned_server_port() {
        let url = Url::parse("http://test.invalid:43123/preview").unwrap();
        let resolver = LocalFixtureResolver::for_url(&url);
        let addresses = resolved_addresses(resolver.resolve("test.invalid".parse().unwrap()))
            .expect("fixture address");
        assert_eq!(addresses, vec!["127.0.0.1:43123".parse().unwrap()]);
    }

    #[test]
    fn resolver_rejects_all_private_addresses() {
        let resolver = FilteredResolver::new(resolver(&["127.0.0.1:80", "169.254.169.254:80"]));
        let error = resolved_addresses(resolver.resolve("example.test".parse().unwrap()))
            .expect_err("all private addresses");
        assert!(error.to_string().contains("private"));
    }

    #[test]
    fn rejects_non_image_response_bytes() {
        let error = validate_image_bytes(b"not an image").expect_err("text response");
        assert!(error.contains("image"));
    }

    #[test]
    fn rejects_signature_only_png() {
        let error = validate_image_bytes(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            .expect_err("signature-only PNG");
        assert!(error.contains("truncated"));
    }

    #[test]
    fn rejects_images_over_the_pixel_limit_without_decoding_them() {
        for (mime, bytes) in [
            ("PNG", png_fixture(100_000, 100_000)),
            ("JPEG", jpeg_fixture(65_535, 65_535)),
            ("GIF", gif_fixture(u16::MAX, u16::MAX)),
            ("WebP", webp_fixture(100_000, 100_000)),
        ] {
            let error = validate_image_bytes(&bytes).expect_err(mime);
            assert!(error.contains("pixel"), "{mime}: {error}");
        }
        let error = validate_image_bytes(&gif_frame_fixture(1, 1, u16::MAX, u16::MAX))
            .expect_err("oversized GIF frame");
        assert!(error.contains("pixel"));
    }

    #[test]
    fn rejects_gif_animation_over_cumulative_pixel_budget() {
        let many_valid_frames = gif_animation_fixture(1, 1, &[(5000, 5000); 5]);
        let error = validate_image_bytes(&many_valid_frames).expect_err("GIF pixel budget");
        assert!(error.contains("pixel"));

        validate_image_bytes(&gif_animation_fixture(1, 1, &[(1920, 1080); 2]))
            .expect("reasonable GIF animation");
    }

    #[test]
    fn accepts_images_with_reasonable_nonzero_dimensions() {
        for (mime, bytes) in [
            ("PNG", png_fixture(1920, 1080)),
            ("JPEG", jpeg_fixture(1920, 1080)),
            ("GIF", gif_fixture(1920, 1080)),
            ("GIF frame", gif_frame_fixture(1, 1, 1, 1)),
            ("WebP", webp_fixture(1920, 1080)),
        ] {
            validate_image_bytes(&bytes).unwrap_or_else(|error| panic!("{mime}: {error}"));
        }
    }

    #[test]
    fn rejects_structurally_incomplete_image_headers() {
        for (mime, bytes) in [
            ("PNG", png_header_only_fixture(1920, 1080)),
            ("GIF", gif_header_only_fixture(1920, 1080)),
            ("JPEG", jpeg_header_only_fixture(1920, 1080)),
            ("WebP", webp_header_only_fixture()),
        ] {
            let error = validate_image_bytes(&bytes).expect_err(mime);
            assert!(
                error.contains("invalid") || error.contains("truncated"),
                "{mime}: {error}"
            );
        }
    }

    #[test]
    fn rejects_vp8x_without_an_image_bitstream() {
        let error =
            validate_image_bytes(&webp_vp8x_only_fixture(1920, 1080)).expect_err("VP8X-only WebP");
        assert!(error.contains("invalid") || error.contains("truncated"));
    }

    #[test]
    fn accepts_vp8x_with_a_following_vp8_image_chunk() {
        validate_image_bytes(&webp_vp8x_with_vp8_fixture(1920, 1080))
            .expect("VP8X canvas plus VP8 image");
    }

    #[test]
    fn accepts_plain_vp8_and_vp8l_webp_images() {
        validate_image_bytes(&webp_plain_vp8_fixture(1920, 1080)).expect("plain VP8 image");
        validate_image_bytes(&webp_plain_vp8l_fixture(1920, 1080)).expect("plain VP8L image");
    }

    fn png_fixture(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = png_header_only_fixture(width, height);
        bytes.extend(chunk(b"IDAT", &[0]));
        bytes.extend(chunk(b"IEND", &[]));
        bytes
    }

    fn png_header_only_fixture(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        bytes.extend((13u32).to_be_bytes());
        bytes.extend(b"IHDR");
        let mut data = Vec::with_capacity(13);
        data.extend(width.to_be_bytes());
        data.extend(height.to_be_bytes());
        data.extend([8, 2, 0, 0, 0]);
        bytes.extend(&data);
        bytes.extend(png_crc(b"IHDR", &data).to_be_bytes());
        bytes
    }

    fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend((data.len() as u32).to_be_bytes());
        bytes.extend(kind);
        bytes.extend(data);
        bytes.extend(png_crc(kind, data).to_be_bytes());
        bytes
    }

    fn png_crc(kind: &[u8; 4], data: &[u8]) -> u32 {
        let mut crc = 0xffff_ffff;
        for byte in kind.iter().chain(data) {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = if crc & 1 != 0 {
                    (crc >> 1) ^ 0xedb8_8320
                } else {
                    crc >> 1
                };
            }
        }
        !crc
    }

    fn gif_header_only_fixture(width: u16, height: u16) -> Vec<u8> {
        let mut bytes = b"GIF89a".to_vec();
        bytes.extend(width.to_le_bytes());
        bytes.extend(height.to_le_bytes());
        bytes.extend([0; 3]);
        bytes
    }

    fn gif_fixture(width: u16, height: u16) -> Vec<u8> {
        let mut bytes = b"GIF89a".to_vec();
        bytes.extend(width.to_le_bytes());
        bytes.extend(height.to_le_bytes());
        bytes.extend([0; 3]);
        bytes.push(0x3b);
        bytes
    }

    fn gif_frame_fixture(
        logical_width: u16,
        logical_height: u16,
        frame_width: u16,
        frame_height: u16,
    ) -> Vec<u8> {
        gif_animation_fixture(
            logical_width,
            logical_height,
            &[(frame_width, frame_height)],
        )
    }

    fn gif_animation_fixture(
        logical_width: u16,
        logical_height: u16,
        frames: &[(u16, u16)],
    ) -> Vec<u8> {
        let mut bytes = gif_fixture(logical_width, logical_height);
        bytes.pop();
        for &(frame_width, frame_height) in frames {
            bytes.extend([0x2c, 0, 0, 0, 0]);
            bytes.extend(frame_width.to_le_bytes());
            bytes.extend(frame_height.to_le_bytes());
            bytes.extend([0, 2, 1, 0, 0]);
        }
        bytes.push(0x3b);
        bytes
    }

    fn webp_fixture(width: u32, height: u32) -> Vec<u8> {
        webp_vp8x_with_vp8_fixture(width, height)
    }

    fn webp_vp8x_only_fixture(width: u32, height: u32) -> Vec<u8> {
        riff_webp(&[webp_vp8x_chunk(width, height)])
    }

    fn webp_vp8x_with_vp8_fixture(width: u32, height: u32) -> Vec<u8> {
        riff_webp(&[
            webp_vp8x_chunk(width, height),
            (
                b"VP8 ",
                vec![0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x07, 0x38, 0x04],
            ),
        ])
    }

    fn webp_plain_vp8_fixture(width: u32, height: u32) -> Vec<u8> {
        riff_webp(&[(b"VP8 ", vp8_data(width, height))])
    }

    fn webp_plain_vp8l_fixture(width: u32, height: u32) -> Vec<u8> {
        let width = width - 1;
        let height = height - 1;
        let data = vec![
            0x2f,
            (width & 0xff) as u8,
            ((width >> 8) as u8 & 0x3f) | (((height & 0x03) as u8) << 6),
            (height >> 2) as u8,
            (height >> 10) as u8 & 0x0f,
        ];
        riff_webp(&[(b"VP8L", data)])
    }

    fn vp8_data(width: u32, height: u32) -> Vec<u8> {
        let mut data = vec![0, 0, 0, 0x9d, 0x01, 0x2a, 0, 0, 0, 0];
        data[6..8].copy_from_slice(&(width as u16).to_le_bytes());
        data[8..10].copy_from_slice(&(height as u16).to_le_bytes());
        data
    }

    fn webp_vp8x_chunk(width: u32, height: u32) -> (&'static [u8; 4], Vec<u8>) {
        let mut data = vec![0; 10];
        let width = width - 1;
        let height = height - 1;
        data[4..7].copy_from_slice(&width.to_le_bytes()[..3]);
        data[7..10].copy_from_slice(&height.to_le_bytes()[..3]);
        (b"VP8X", data)
    }

    fn riff_webp(chunks: &[(&[u8; 4], Vec<u8>)]) -> Vec<u8> {
        let payload_length = 4 + chunks
            .iter()
            .map(|(_, data)| 8 + data.len() + data.len() % 2)
            .sum::<usize>();
        let mut bytes = b"RIFF".to_vec();
        bytes.extend(u32::try_from(payload_length).unwrap().to_le_bytes());
        bytes.extend(b"WEBP");
        for (kind, data) in chunks {
            bytes.extend(*kind);
            bytes.extend(u32::try_from(data.len()).unwrap().to_le_bytes());
            bytes.extend(data);
            if data.len() % 2 != 0 {
                bytes.push(0);
            }
        }
        bytes
    }

    fn jpeg_fixture(width: u16, height: u16) -> Vec<u8> {
        let mut bytes = jpeg_header_only_fixture(width, height);
        bytes.truncate(bytes.len() - 2);
        bytes.extend([0xff, 0xda, 0x00, 0x08, 3, 1, 1, 0, 2, 0, 0, 0xff, 0xd9]);
        bytes
    }

    fn jpeg_header_only_fixture(width: u16, height: u16) -> Vec<u8> {
        let mut bytes = vec![0xff, 0xd8, 0xff, 0xc0, 0x00, 0x13, 0x08];
        bytes.extend(height.to_be_bytes());
        bytes.extend(width.to_be_bytes());
        bytes.extend([3, 1, 1, 0, 2, 1, 2, 0, 3, 1, 3, 0]);
        bytes.extend([0xff, 0xd9]);
        bytes
    }

    fn webp_header_only_fixture() -> Vec<u8> {
        b"RIFF\x08\x00\x00\x00WEBPVP8X".to_vec()
    }

    #[test]
    fn rejects_https_to_http_redirects() {
        let current = Url::parse("https://example.com/image").unwrap();
        let error = resolve_redirect(&current, "http://example.com/other").expect_err("downgrade");
        assert!(error.contains("downgrade"));
    }

    #[test]
    fn rejects_non_http_redirect_targets() {
        let current = Url::parse("https://example.com/image").unwrap();
        let error = resolve_redirect(&current, "file:///tmp/image").expect_err("file redirect");
        assert!(error.contains("http"));
    }

    #[test]
    fn rejects_redirect_to_private_target() {
        let current = Url::parse("https://example.com/image").unwrap();
        let error =
            resolve_redirect(&current, "http://127.0.0.1/secret").expect_err("private redirect");
        assert!(error.to_string().contains("private"));
    }

    #[test]
    fn fetch_rejects_non_image_http_response() {
        let url = serve_once(b"not an image".to_vec(), None);
        let error = fetch_with_client(&url, test_client()).expect_err("text response");
        assert!(error.contains("image"));
    }

    #[test]
    fn fetch_identifies_the_desktop_client_to_remote_image_hosts() {
        let (url, request) = serve_once_and_capture_request(jpeg_fixture(1, 1));
        fetch_with_client(&url, test_client()).expect("valid image response");
        let request = request
            .recv()
            .expect("captured request")
            .to_ascii_lowercase();
        assert!(
            request.contains("user-agent: corelib-desktop/"),
            "{request}"
        );
        assert!(
            request.contains("accept: image/avif,image/webp,image/*"),
            "{request}"
        );
    }

    #[test]
    fn rejects_oversized_response_bytes() {
        let mut bytes = vec![0u8; MAX_REMOTE_IMAGE_BYTES + 1];
        bytes[..8].copy_from_slice(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        let error = validate_image_bytes(&bytes).expect_err("oversized response");
        assert!(error.contains("limit"));
    }

    #[test]
    fn fetch_rejects_oversized_http_response_before_buffering() {
        let url = serve_once(Vec::new(), Some(MAX_REMOTE_IMAGE_BYTES + 1));
        let error = fetch_with_client(&url, test_client()).expect_err("oversized response");
        assert!(error.contains("limit"));
    }

    #[test]
    fn fetch_rejects_redirect_chain_over_limit() {
        let error =
            fetch_with_client(&serve_redirect_chain(), test_client()).expect_err("redirect chain");
        assert!(error.contains("redirect limit"));
    }

    fn test_client() -> Client {
        Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .resolve("test.invalid", "127.0.0.1:0".parse().unwrap())
            .build()
            .expect("test client")
    }
}
