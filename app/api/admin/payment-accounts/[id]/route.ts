/**
 * PATCH  /api/admin/payment-accounts/[id]  — Update a payment account (partial update)
 * DELETE /api/admin/payment-accounts/[id]  — Delete a payment account
 *
 * Super-admin-only endpoints for managing individual payment accounts.
 *
 * Validates: Requirements 25.7, 25.8, 25.9, 25.10, 25.11, 25.12, 25.13, 26.4, 26.5
 */

import { requireSuperAdmin } from '../../_auth';

// ---------------------------------------------------------------------------
// PATCH handler — partial update
// ---------------------------------------------------------------------------

/**
 * PATCH /api/admin/payment-accounts/[id]
 *
 * Partially updates a payment account. Accepts either:
 *   - JSON body with any subset of fields
 *   - multipart/form-data (when a new qr_image file is included)
 *
 * If qr_image file is present in multipart, uploads it to Supabase Storage
 * and sets qr_image_url to the resulting public URL.
 *
 * Only fields present in the request body are updated (partial update).
 *
 * Validates: Requirements 25.7, 25.8, 25.9, 25.10, 25.11, 25.12, 25.13, 26.4
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize — super_admin only
    // Validates: Requirements 25.7, 26.4
    const authResult = await requireSuperAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Resolve dynamic route param
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Step 3: Verify the account exists
    // Validates: Requirements 25.8, 25.9
    const { data: existingRow, error: fetchError } = await adminClient
      .from('payment_accounts')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || existingRow === null) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 4: Parse body — detect content-type to handle multipart vs JSON
    // Validates: Requirements 25.10, 25.11, 25.12, 25.13
    const contentType = request.headers.get('content-type') ?? '';
    const updates: Record<string, unknown> = {};

    if (contentType.includes('multipart/form-data')) {
      // Parse multipart/form-data
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return Response.json({ error: 'Invalid form data' }, { status: 400 });
      }

      // Extract optional text fields — only include if present and non-empty
      const textFields = [
        'account_holder',
        'bank_name',
        'account_no',
        'ifsc',
        'upi_id',
      ] as const;

      for (const fieldName of textFields) {
        const value = formData.get(fieldName);
        if (value !== null && typeof value === 'string' && value.trim() !== '') {
          updates[fieldName] = value.trim();
        }
      }

      // Handle is_active boolean field
      const isActiveValue = formData.get('is_active');
      if (isActiveValue !== null) {
        updates.is_active = isActiveValue === 'true' || isActiveValue === '1';
      }

      // Handle sort_order numeric field
      const sortOrderValue = formData.get('sort_order');
      if (sortOrderValue !== null && typeof sortOrderValue === 'string') {
        const parsed = parseInt(sortOrderValue, 10);
        if (!isNaN(parsed)) {
          updates.sort_order = parsed;
        }
      }

      // Handle qr_image file upload
      // Validates: Requirements 25.13
      const qrImageFile = formData.get('qr_image');
      if (qrImageFile instanceof File) {
        const filename = qrImageFile.name || 'qr.png';
        const storagePath = `${Date.now()}_${filename}`;
        const fileBuffer = await qrImageFile.arrayBuffer();

        const { error: uploadError } = await adminClient.storage
          .from('payment-qr-codes')
          .upload(storagePath, fileBuffer, {
            contentType: qrImageFile.type || 'image/png',
            upsert: false,
          });

        if (uploadError) {
          console.error(
            '[PATCH /api/admin/payment-accounts/[id]] Storage upload error:',
            uploadError.message,
          );
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }

        const { data: publicUrlData } = adminClient.storage
          .from('payment-qr-codes')
          .getPublicUrl(storagePath);

        updates.qr_image_url = publicUrlData.publicUrl;
      }
    } else {
      // Parse JSON body
      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
      }

      // Extract only the fields that are present in the body
      const allowedFields = [
        'account_holder',
        'bank_name',
        'account_no',
        'ifsc',
        'upi_id',
        'qr_image_url',
        'is_active',
        'sort_order',
      ] as const;

      for (const fieldName of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, fieldName)) {
          updates[fieldName] = body[fieldName];
        }
      }
    }

    // Step 5: If no fields to update, return the existing row unchanged
    if (Object.keys(updates).length === 0) {
      const { data: currentRow, error: currentFetchError } = await adminClient
        .from('payment_accounts')
        .select('*')
        .eq('id', id)
        .single();

      if (currentFetchError || currentRow === null) {
        return Response.json({ error: 'Internal server error' }, { status: 500 });
      }

      return Response.json(currentRow, { status: 200 });
    }

    // Step 6: Perform the partial update
    // Validates: Requirements 25.10, 25.11, 25.12
    const { data: updatedRow, error: updateError } = await adminClient
      .from('payment_accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error(
        '[PATCH /api/admin/payment-accounts/[id]] DB update error:',
        updateError.message,
      );
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Validates: Requirements 26.4
    return Response.json(updatedRow, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE handler — hard-delete a payment account
// ---------------------------------------------------------------------------

/**
 * DELETE /api/admin/payment-accounts/[id]
 *
 * Deletes a payment account by ID.
 *
 * Validates: Requirements 25.7, 25.8, 25.9, 26.5
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize — super_admin only
    // Validates: Requirements 25.7, 26.5
    const authResult = await requireSuperAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Resolve dynamic route param
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Step 3: Verify the account exists
    // Validates: Requirements 25.8, 25.9
    const { data: existingRow, error: fetchError } = await adminClient
      .from('payment_accounts')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || existingRow === null) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 4: Delete the row
    // Validates: Requirements 25.8, 25.9
    const { error: deleteError } = await adminClient
      .from('payment_accounts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error(
        '[DELETE /api/admin/payment-accounts/[id]] DB delete error:',
        deleteError.message,
      );
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Validates: Requirements 26.5
    return Response.json({ deleted: true }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
