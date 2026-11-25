-- Clean up empty zero-stock placeholder rows that were automatically generated for other stores
-- when a part was added to a single store's warehouse (i.e. quantity=0, minQuantity=0, location='',
-- no stock movements in that store, and the part belongs to another store's warehouse).
DELETE FROM "Stock" s
WHERE s."quantity" = 0
  AND s."minQuantity" = 0
  AND s."location" = ''
  AND NOT EXISTS (
    SELECT 1 FROM "StockMovement" m
    WHERE m."partId" = s."partId" AND m."storeId" = s."storeId"
  )
  AND EXISTS (
    SELECT 1 FROM "Stock" other
    WHERE other."partId" = s."partId" AND other."storeId" <> s."storeId"
  );
