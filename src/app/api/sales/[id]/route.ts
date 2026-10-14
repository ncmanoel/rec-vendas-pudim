import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function PUT(req: Request) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { password, id, nome_cliente, nome_produto, valor, telefone } = body;

    if (password !== 'Atletico2000') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID da venda é obrigatório' }, { status: 400 });
    }

    const updatePayload: Record<string, any> = {
      nome_produto,
      valor: parseFloat(valor),
      telefone: telefone ? telefone.replace(/\D/g, '') : null,
      nome_cliente: nome_cliente !== undefined ? (nome_cliente ? nome_cliente.trim() : null) : undefined,
    };

    // Remove chaves undefined
    Object.keys(updatePayload).forEach(key => updatePayload[key] === undefined && delete updatePayload[key]);

    const { error: updateError } = await supabase
      .from('vendas')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) {
      console.error('Erro ao atualizar venda:', updateError);
      return NextResponse.json({ error: 'Erro de banco de dados ao atualizar venda' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Venda atualizada com sucesso!' });
  } catch (error: any) {
    console.error('Update Sale Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { password, id } = body;

    if (password !== 'Atletico2000') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID da venda é obrigatório' }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from('vendas')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Erro ao excluir venda:', deleteError);
      return NextResponse.json({ error: 'Erro de banco de dados ao excluir venda' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Venda excluída com sucesso!' });
  } catch (error: any) {
    console.error('Delete Sale Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
