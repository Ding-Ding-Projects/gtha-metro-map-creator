#!/bin/sh
# Checks desktop/deploy/lib/fat32.js against real FAT32 tools: adds gmmc-password-hash to the root directory of
# a FAT32 boot partition inside a raw MBR image (for directories that end inside a cluster, exactly at a cluster
# boundary and across one), then requires fsck.vfat to find no errors and mtools to read the file back.
# It needs a disposable Linux machine with node, mtools, dosfstools and sfdisk. From the repository root:
#   docker run --rm -v "$PWD:/repo:ro" alpine:3.22 sh /repo/scripts/verify/check-fat32.sh
set -u
apk add --no-cache nodejs mtools dosfstools util-linux sfdisk coreutils >/dev/null 2>&1
HASH="pbkdf2-sha256:600000:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
fails=0
for n in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  truncate -s 41M /tmp/t.img
  printf 'label: dos\nunit: sectors\nstart=2048, size=80000, type=c\n' | sfdisk /tmp/t.img >/dev/null 2>&1
  truncate -s 39M /tmp/p; mkfs.vfat -F 32 -s 1 -n GMMCBOOT /tmp/p >/dev/null
  i=0; while [ $i -lt $n ]; do echo "x$i" > /tmp/f; mcopy -i /tmp/p /tmp/f "::fileabc$i.bin"; i=$((i+1)); done
  dd if=/tmp/p of=/tmp/t.img bs=1M seek=1 conv=notrunc status=none
  node -e 'require("/repo/desktop/deploy/lib/fat32.js").addFileToFirstPartition("/tmp/t.img","gmmc-password-hash",process.argv[1]+"\n")' "$HASH"
  dd if=/tmp/t.img of=/tmp/a bs=1M skip=1 count=39 status=none
  if fsck.vfat -n /tmp/a >/tmp/fsck.out 2>&1 && mcopy -i /tmp/a ::gmmc-password-hash /tmp/o && [ "$(cat /tmp/o)" = "$HASH" ]; then echo "n=$n ok"; else echo "n=$n FAIL"; cat /tmp/fsck.out; fails=$((fails+1)); fi
done
echo "fails=$fails"
[ "$fails" -eq 0 ]
